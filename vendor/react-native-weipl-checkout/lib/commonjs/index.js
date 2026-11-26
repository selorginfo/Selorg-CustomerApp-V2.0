'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _reactNative = require("react-native");
class WeiplCheckout {
  /**
   * Opens the WeiplCheckout with the specified options.
   *
   * @param {object} options - The options for the WeiplCheckout.
   * @param {function} responseCallback - The callback function to handle the response from WeiplCheckout.
   * @param {function} errorCallback - The callback function to handle any errors that occur during the WeiplCheckout process.
   */
  static open(options, responseCallback, errorCallback) {
    _reactNative.NativeModules.WeiplCheckout.open(options, responseCallback, errorCallback);
  }

  /**
   * Returns a promise that resolves with the list of UPI intent apps for Android platform only
   * @returns {Promise<Array<string>>} A promise that resolves with an array of UPI intent app names.
   */
  static upiIntentAppsList() {
    return new Promise((resolve, reject) => {
      resolve(_reactNative.NativeModules.WeiplCheckout.upiIntentAppsList());
    });
  }

  /**
   * Checks if the UPI app is installed on the device for iOS platform only
   * 
   * @param {string} scheme - The scheme of the UPI app.
   * @returns {boolean} - True if the UPI app is installed, false otherwise.
   */
  static checkInstalledUpiApp(scheme) {
    let response = _reactNative.NativeModules.WeiplCheckout.checkInstalledUpiApp(scheme);
    return response;
  }
}
var _default = exports.default = WeiplCheckout;
//# sourceMappingURL=index.js.map