/** Endpoints we will make requests to */
var BASE_URL = 'https://api.hubapi.com/';
var LIST_FORMS = BASE_URL + 'forms/v2/forms/';
var FORM_FIELDS = BASE_URL + 'forms/v2/fields/';
var FORM_FILLS =  BASE_URL + '/form-integrations/v1/submissions/forms/';

/** Constants */
const SCHEMA_FIELDS = 'schemaFields';

var cc = DataStudioApp.createCommunityConnector();

/** 
 * Return true for more descriptive debugging messages
 */
function isAdminUser() {
  return true;
}

/**
 * Set the authentication required authentication type for connecting to the service
 * https://developers.google.com/datastudio/connector/auth#getauthtype
 */
function getAuthType() {
  var AuthTypes = cc.AuthType;
  return cc.newAuthTypeResponse()
    .setAuthType(AuthTypes.OAUTH2)
    .build();
}

/** 
 * Makes a request to a HubSpot endpoint {url}
 * @return {Object}
 */
function makeRequest(url) {
  var service = getOAuthService();
  
  /* Verify that authorization to use the service exists */
  if (!service.hasAccess()) {
    throw new Error('Error: Missing HubSpot authorization.');
  }
  
  /* Add the OAuth token to the headers in the request */ 
  var fetchOptions = {
    headers: {
      Authorization: 'Bearer ' + service.getAccessToken()
    }
  };
  
  /* Send the request along with the headers */
  var response = UrlFetchApp.fetch(url, fetchOptions);
  Logger.log(JSON.stringify(response, null, 2));
  
  /* Return response as an object */
  return JSON.parse(response.getContentText());
}

/**
 * Set the configuration fields that will be requested
 * https://developers.google.com/datastudio/connector/reference#getconfig
 */
function getConfig(request) {
  var config = cc.getConfig();
  
  /* Add instructions for the user */
  config.newInfo()
    .setId('instructions')
    .setText('Select the HubSpot form you would like to connect to.');
  
  /* Add a dropdown for the forms */
  var dropdown = config.newSelectSingle()
    .setId('form')
    .setName('HubSpot Forms')
    .setHelpText('Select the HubSpot form to connect to.')
  
  /* Make a request to the forms endpoint */
  var forms = makeRequest(LIST_FORMS);
  
  /* Iterate through the forms and add as options to the dropdown */
  forms.forEach(function(f) {
    dropdown.addOption(config.newOptionBuilder().setLabel(f.name).setValue(f.guid));
  });
  
  /* Add a checkbox for using cache service */
  config.newCheckbox()
      .setId('useCache')
      .setName('Use Cache Service')
      .setHelpText('Select to reduce number of requests to HubSpot service for faster load times. Note that manually requesting data refreshes will no longer work. Forms with large amounts of data (JSON exceeding 100Kb) will be unable to use cache service regardless of whether it is selected.');

  return config.build();
}

/**
 * Return true if the user provided a valid configuration
 */
function validateConfig(config) {
  var config = config || {};
  if (!config.form) {
    cc.newUserError()
      .setText('You must select a form')
      .throwException();
  }
  return true;
}

/**
 * Get the fields for the form and set a default data type
 */
function getFields(request, useCache = false) {
  var fields = cc.getFields();
  var types = cc.FieldType;
  var aggregations = cc.AggregationType;
  var cache = CacheService.getUserCache();
  var formFields = null;
  
  if (useCache) {
    console.info('Attempting to retrieve form fields from cache ...');
    formFields = cache.get(SCHEMA_FIELDS);
    
    console.log('cached fields: ' + formFields);
    
    /* If cache is not empty, transform JSON string to object */
    if (formFields) {
      formFields = JSON.parse(formFields);
    }
  }

  if (!formFields) {
    /* Make a request to the forms fields endpoint */
    console.info('Requesting form fields from HubSpot ...');
    var formId = request.configParams.form;
    formFields = makeRequest(FORM_FIELDS + formId);
    
    if (useCache) {
      /* Store response in cache for 6 hours*/
      try {
        cache.put(SCHEMA_FIELDS, JSON.stringify(formFields), 21600);
      } catch (error) {
        console.log('Form fields could not be cached. Error: ' + error.toString());
      }
    }
  }
  
  /* Iterate through the fields and add as dimensions */
  formFields.forEach(function(f) {
    fields.newDimension()
      .setId(f.name)
      .setName(f.label)
      .setType(getType(f))    
  });
  
  /* Add a field for the timestamp when submitted */
  fields.newDimension()
     .setId('submittedAt')
     .setName('Date submitted')
     .setType(types.YEAR_MONTH_DAY_SECOND)
     .setGroup('DATE');
  
  /* Add a field for counting the number of records */
  fields.newMetric()
    .setId('count')
    .setName('Count')
    .setType(types.NUMBER)
    .setAggregation(aggregations.AUTO);
  
  return fields;
}

/**
 * Build the schema for the data
 * https://developers.google.com/datastudio/connector/reference#getschema
 */
function getSchema(request) {
  var fields = getFields(request);
  return { schema: fields.build() };
}

/**
 * Request all the form submissions from HubSpot
 * https://developers.google.com/datastudio/connector/reference#getdata
 */
function getData(request) {
  var cache = CacheService.getUserCache();
  var useCache = request.configParams.useCache;
  var rows = null;
  
  console.info('Getting data ...');
  
  /* Get the form Id */
  var formId = request.configParams.form;
  var schemaFields = getFields(request, useCache);
  
  /* Get the Ids for the fields used in the chart */
  var fields = request.fields.map(function(field) {
    return field.name;
  });
  
  if (useCache) {
    var key = JSON.stringify(fields);
    
    console.info('Attempting to retrieve data for fields %s from cache ...', key);
    
    var fieldData = cache.get(key);
  
    /* If cache is not empty, transform JSON string to object. If empty,
     request the data from HubSpot */
    if (fieldData) {
      console.info('Returning data from cache ...');
      rows = JSON.parse(fieldData);
    }
      
  }
  
  if (!rows) {
    console.info('Requesting fill data from HubSpot...');
    
    /* Build the base url to request 50 submissions at a time */
    var url = FORM_FILLS + formId + '?limit=50';
    var nextUrl = url;
    
    rows = [];
    while(nextUrl) {
      console.log('Requesting url: ' + nextUrl);
      /* Make a request to the forms submissions endpoint for a max of 50 submissions*/
      var response = makeRequest(nextUrl);
      var formFills = response.results;
      
      /* Transform the results and push into rows */
      formFills.forEach(function(f) {
        rows.push(parseSubmission(f, fields));
      });
      
      nextUrl = getNextUrl(url, response);
      console.log('next url: ' + nextUrl);
    }
    
    if (useCache) {
      /* Store rows in cache for 6 hours*/
      try {
        cache.put(key, JSON.stringify(rows), 21600);
      } catch (error) {
        console.log('Fields data could not be cached. Error: ' + error.toString());
      }
    }
  }
  
  console.log('rows: ' + JSON.stringify(rows));
  return {
    schema: schemaFields.forIds(fields).build(),
    rows: rows
  };
}

/**
 * Parse a single form submission. Returns an array with values in the same order as the schema.
 */
function parseSubmission(fill, fields) {
  var values = fill.values || [];
  
  /* Create a map of the fill values */
  var mappedValues = new Map();
  values.forEach(function(v) {
        mappedValues.set(v.name, v.value);
  });
  
  var date = new Date(fill.submittedAt);
  
  mappedValues.set('submittedAt', yyyymmddhhmmss(date));
  mappedValues.set('count', '1');
  
  var row = fields.map(function(f) {
    return mappedValues.get(f);
  });
  
  console.log('row: ' + row);
  return {values: row};
}

/**
 * Build the url that will return the next batch of results
 */
function getNextUrl(url, response) {
  var paging = response.paging || {};
  console.log('next: ' + JSON.stringify(paging));

  if (!paging.next) {
    return null;
  }
  return url + '&after=' + paging.next.after;
}

/**
 * Maps the field type reported by HubSpot to Apps Script values
 */
function getType(field) {
  var types = cc.FieldType;
  var hubSpotType = field.type;
  
  switch(hubSpotType) {
    case 'string':
      return types.TEXT;
    case 'number':
      return types.NUMBER;
    case 'date':
      return types.YEAR_MONTH_DAY;
    case 'datetime':
      return types.YEAR_MONTH_DAY_MINUTE;
    case 'enumeration':
      if(field.fieldType == 'booleancheckbox' || field.fieldType == 'calculation_equation') {
        return types.BOOLEAN;
      }
      return types.TEXT;
    default:
      return types.TEXT;
  }
}

/**
 * Transform a date into the apps script accepted yyyyMMddhhmmss format
 */
function yyyymmddhhmmss(date) {
  var MM = date.getMonth() + 1; // getMonth() is zero-based
  var dd = date.getDate();
  var hh = date.getHours();
  var mm = date.getMinutes();
  var ss = date.getSeconds();

  return [date.getFullYear(),
          (MM>9 ? '' : '0') + MM,
          (dd>9 ? '' : '0') + dd,
          (hh>9 ? '' : '0') + hh,
          (mm>9 ? '' : '0') + mm,
          (ss>9 ? '' : '0') + ss
         ].join('');
};
    