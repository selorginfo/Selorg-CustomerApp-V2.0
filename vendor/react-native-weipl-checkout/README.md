# React Native plugin for Worldline ePayments India Mobile SDKs

This is Worldline India ePayments official React Native wrapper around our Android and iOS mobile SDKs. 

[![npm](https://img.shields.io/npm/l/express.svg)]()
[![NPM Version](http://img.shields.io/npm/v/react-native-weipl-checkout.svg?style=flat)](https://www.npmjs.com/package/react-native-weipl-checkout)
[![NPM Downloads](https://img.shields.io/npm/dm/react-native-weipl-checkout.svg?style=flat)](https://npmcharts.com/compare/react-native-weipl-checkout?minimal=true)

[![NPM](https://nodei.co/npm/react-native-weipl-checkout.png?downloads=true)](https://nodei.co/npm/react-native-weipl-checkout/)

* [Installation](#installation)
* [Linking](#linking)
* [Usage](#usage)
* [Permissions](#permissions)
* [License](#license)

## Installation

Using npm:

```shell
npm install --save react-native-weipl-checkout
```

or using yarn:

```shell
yarn add react-native-weipl-checkout
```
**Note for Android**: Make sure that the minimum API level for your app is 24 or higher.

**Note for iOS**: Make sure that the minimum deployment target for your app is iOS 13.0 or higher.

## Linking

- **iOS**
  ```sh
  # install
  npm install react-native-weipl-checkout --save
  cd ios
  pod install && cd .. # CocoaPods on iOS needs this extra step
  # run
  npm start ios # you can run your application using yarn commands as well
  ```
- **Android**
  ```sh
  # install
  npm install react-native-weipl-checkout --save
  # run
  npm start android # you can run your application using yarn commands as well
  ```

## Usage

Sample code to integrate can be found in [example/src/App.js](example/src/App.js).

To run & test sample code use below command by navigating into example folder:

`$ npm install`

### Steps

1. Declaration: After plugin installation add entry of below details in `declaration.d.ts`. If this file is not available in your project then create file with `declaration.d.ts` name in src folder and add below code.
    ```js
    declare module '*';

    declare var WeiplCheckout: any;
    ```

2. Import WeiplCheckout module to your component:
    ```js
    import WeiplCheckout from 'react-native-weipl-checkout';
    ```

3. Call `WeiplCheckout.open` method with the payment `options` along with callback functions(e.g., `responseCallback` & `errorCallback`). The method return response to `responseCallback` callback function for Success & Failed cases only. In case of any exception response will be provided in `errorCallback` callback function.
    ```js
    <TouchableHighlight onPress={() => {
      var options = {
        "features": {
          "enableAbortResponse": true,
          "enableExpressPay": true,
          "enableInstrumentDeRegistration": true,
          "enableMerTxnDetails": true
        },
        "consumerData": {
          "deviceId": "iOSSH2",   //supported values "ANDROIDSH1" or "ANDROIDSH2" for Android, supported values "iOSSH1" or "iOSSH2" for iOS and supported values
          "token": "e210b297516dada3795a0064d436a4a2a9a9f5dd2af35977bca1a595e7b39c54b9cf0c048b78196fbcae1d7d32b758066d1492a61ae59ead772ea6088481c475",
          "paymentMode": "all",
          "merchantLogoUrl": "https://www.paynimo.com/CompanyDocs/company-logo-vertical.png",  //provided merchant logo will be displayed
          "merchantId": "L3348",
          "currency": "INR",
          "consumerId": "cust_01",
          "txnId": "1707121338063",   //Unique merchant transaction ID
          "items": [{
            "itemId": "first",
            "amount": "1",
            "comAmt": "0"
          }],
          "totalAmount": "1",
          "customStyle": {
            "PRIMARY_COLOR_CODE": "#45beaa",    // RGB and Hex and RGB supported parameter
            "SECONDARY_COLOR_CODE": "#ffffff",
            "BUTTON_COLOR_CODE_1": "#2d8c8c",
            "BUTTON_COLOR_CODE_2": "#ffffff",
          }
        }
      };
      WeiplCheckout.open(options, responseCallback, errorCallback);

      function responseCallback(res) {
        // After capturing response perform HASH validation as mentioned in documentation and do rest of the activity to update in your system & show Seccess/Failure/Pending acknowledgement details to end customer depending on response status. 
      }

      function errorCallback(res) {
        // You will get response in this method in case of exceptions only, after capturing response you can handle these case as exceptions.
      }
    }}>
    ```

    Change the **options** accordingly from below links for **[React Native](https://www.paynimo.com/paynimocheckout/docs/?device=react-native&nav=params#online)**.

4. Response Handling, please refer detailed response handling & HASH match logic explaination for **[React Native](https://www.paynimo.com/paynimocheckout/docs/?device=react-native&nav=response#online)**.

    **Note:** HASH Match logic should always be performed on server side only. 

## Permissions

- For UPI Intent in **iOS**, the info.plist in **iOS** should be modified to include `LSApplicationQueriesSchemes`.

  ```shell
  <key>LSApplicationQueriesSchemes</key>
  <array>
    <string>phonepe</string>
    <string>gpay</string>
    <string>paytm</string>
    <string>credpay</string>
  </array>
  ```
- For UPI Intent in **Android** please below code in AndroidManifest file of your react-native application, e.g. `YOUR_APPLICATION_ROOT_FOLDER/android/app/src/main/AndroidManifest.xml`

  ```shell
  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW" />
      <data android:scheme="upi" android:host="pay"/>
    </intent>
  </queries>
  ```
 - Add below code in AndroidManifest file file of your react-native application, e.g. `YOUR_APPLICATION_ROOT_FOLDER/android/app/src/main/AndroidManifest.xml`:

    ```shell
    <activity android:name="com.weipl.checkout.WLCheckoutActivity" android:exported="true" android:screenOrientation="portrait"/>
    ```



## License

**react-native-weipl-checkout** is Copyright (c) Worldline ePayments India Pvt. Ltd.
It is distributed under [the MIT License][LICENSE].