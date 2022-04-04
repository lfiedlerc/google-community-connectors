var SERVICE_NAME = 'HubSpot';
var AUTHORIZATION_BASE_URL = 'https://app.hubspot.com/oauth/authorize';
var TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

/**
 * Sets the Client Id. Remove Id after setting so as not to have it hard-coded.
 */
function setClientId() {
  var props = PropertiesService.getScriptProperties();
  //props.setProperty('OAUTH_CLIENT_ID', '');
}

/**
 * Sets the Client Secret. Remove Secret after setting so as not to have it hard-coded.
 */
function setClientSecret() {
  var props = PropertiesService.getScriptProperties();
  //props.setProperty('OAUTH_CLIENT_SECRET', '');
}

/**
 * Gets an OAuth2 service configured for the HubSpot API.
 * @return {OAuth2.Service} The OAuth2 service
 */
function getOAuthService() {
  setClientId();
  setClientSecret();
  
  var scriptProps = PropertiesService.getScriptProperties();
  var clientId = scriptProps.getProperty('OAUTH_CLIENT_ID');
  var clientSecret = scriptProps.getProperty('OAUTH_CLIENT_SECRET');

  return OAuth2.createService(SERVICE_NAME)
    .setAuthorizationBaseUrl(AUTHORIZATION_BASE_URL)
    .setTokenUrl(TOKEN_URL)
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setPropertyStore(PropertiesService.getUserProperties())
    .setCallbackFunction('authCallback')
    .setScope('forms');
}

/**
 * The callback that is invoked after an authentication attempt.
 */
function authCallback(request) {
  var authorized = getOAuthService().handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Success! You can close this tab.');
  } else {
    return HtmlService.createHtmlOutput('Denied. You can close this tab');
  }
}

/**
 * Returns {boolean} `true` if successfully authenticated--false otherwise.
 */
function isAuthValid() {
  return getOAuthService().hasAccess();
}

/**
 * Resets the OAuth2 service.
 */
function resetAuth() {
  getOAuthService().reset();
}

/**
 * Returns the 3P authorization urls for the service.
 */
function get3PAuthorizationUrls() {
  return getOAuthService().getAuthorizationUrl();
}