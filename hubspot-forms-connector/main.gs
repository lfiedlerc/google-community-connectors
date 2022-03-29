var cc = DataStudioApp.createCommunityConnector();

function getAuthType() {
  var AuthTypes = cc.AuthType;
  return cc
    .newAuthTypeResponse()
    .setAuthType(AuthTypes.KEY)
    .build();
}

function resetAuth() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty('dscc.key');
}

function isAuthValid() {
  var userProperties = PropertiesService.getUserProperties();
  var key = userProperties.getProperty('dscc.key');
  return checkForValidKey(key);
}

function setCredentials(request) {
  var key = request.key;

  var validKey = checkForValidKey(key);
  if (!validKey) {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  var userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('dscc.key', key);
  return {
    errorCode: 'NONE'
  };
}

function checkForValidKey(key){
  return true;
}

function getConfig(request) {
  var config = cc.getConfig();

  config.newInfo()
    .setId('instructions')
    .setText('Select the HubSpot form you would like to connect to.');

  config.newSelectSingle()
    .setId('form')
    .setName('form select')
    .setHelpText('Select the HubSpot form to connect to.')
    .addOption(config.newOptionBuilder().setLabel('Lorum foo').setValue('lorem'))
    .addOption(config.newOptionBuilder().setLabel('Ipsum Bar').setValue('ipsum'))
    .addOption(config.newOptionBuilder().setLabel('IP Registration Form New').setValue('185731a7-cd0e-4cc9-acb4-fa2f855ac5b3'));

  return config.build();
}

function getFields(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;
  var aggregations = cc.AggregationType;
  
  fields.newDimension()
    .setId('firstname')
    .setType(types.TEXT);

  fields.newDimension()
    .setId('lastname')
    .setType(types.TEXT);

  fields.newDimension()
    .setId('your_field')
    .setType(types.TEXT);
  
  return fields;
}

function getSchema(request) {
  var fields = getFields(request).build();
  return { schema: fields };
}

function responseToRows(requestedFields, response) {
  // Transform parsed data and filter for requested fields
  return response.map(function(submissions) {
    var row = [];
    requestedFields.asArray().forEach(function (field) {
      switch (field.getId()) {
        case 'firstname':
          return row.push('Joe');
        case 'lastname':
          return row.push('Feathers');
        case 'your_field':
          return row.push('Feather King');
        default:
          return row.push('');
      }
    });
    return { values: row };
  });
}

function getData(request) {
  var requestedFieldIds = request.fields.map(function(field) {
    return field.name;
  });
  var requestedFields = getFields().forIds(requestedFieldIds);

  // Fetch and parse data from API
  var url = [
    'https://api.hubapi.com/form-integrations/v1/submissions/forms/185731a7-cd0e-4cc9-acb4-fa2f855ac5b3?hapikey=6ac444ca-4f96-49ac-b51e-dbdc9282c9c2'
  ];
  var response = UrlFetchApp.fetch(url.join(''));
  var parsedResponse = JSON.parse(response).results;
  var rows = responseToRows(requestedFields, parsedResponse);

  return {
    schema: requestedFields.build(),
    rows: rows
  };
}