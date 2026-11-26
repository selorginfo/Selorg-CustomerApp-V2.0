import UIKit
import Foundation
import weipl_checkout
import React

/**
 This module provides integration with the Worldline ePayments India SDK for React Native.
 It allows for initiating the checkout process, handling payment responses, and retrieving the list of UPI apps installed on the device in the iOS platform.
 */
@objc(WeiplCheckout)
class WeiplCheckout: NSObject, RCTInitializing {
    
    private var wlCheckout: WLCheckoutViewController?
    
    private var wlResponseCallback: RCTResponseSenderBlock?
    private var wlErrorCallback: RCTResponseSenderBlock?
    
    /**
     Initializes the WeiplCheckout object and sets up the necessary observers for payment response and payment error notifications.
     It preloads data for WLCheckoutViewController. It sets up the necessary observers to listen for payment response and payment error notifications. The payment response and payment error notifications are posted by the WeiplCheckoutViewController class.
     */
    func initialize() {
        DispatchQueue.main.async{
            self.wlCheckout = WLCheckoutViewController()
            
            NotificationCenter.default.addObserver(self, selector: #selector(self.wlCheckoutPaymentResponse(result:)), name: Notification.Name("wlCheckoutPaymentResponse"), object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(self.wlCheckoutPaymentError(result:)), name: Notification.Name("wlCheckoutPaymentError"), object: nil)
        }
    }

    /**
     Initiates Checkout SDK
     
     - Parameters:
        - option: The options for checkout initialization.
        - responseCallback: A block that will be called with the response from the WeiplCheckout view.
        - errorCallback: A block that will be called if an error occurs during the WeiplCheckout process.
     */
    @objc(open:withResponseCallback:withErrorCallback:)
    func open(option: Dictionary<String,Any>, _ responseCallback: @escaping RCTResponseSenderBlock, _ errorCallback: @escaping RCTResponseSenderBlock) -> Void {
        
        self.wlResponseCallback = responseCallback;
        self.wlErrorCallback = errorCallback;
        
        if (option.isEmpty) {
            let retResponse: [String: Any] = [
                "error_code": "0399",
                "error_desc": "Expected checkout initialisation options"]
            
            self.wlErrorCallback!([retResponse])
            return;
        }
        
        do {
            let jSONObject = String(data: try JSONSerialization.data(withJSONObject: option as Any, options: .prettyPrinted), encoding: String.Encoding(rawValue: NSUTF8StringEncoding))
            
            DispatchQueue.main.async {
                self.wlCheckout!.open(requestObj: jSONObject!)
                UIApplication.shared.delegate?.window??.rootViewController?.present(self.wlCheckout!, animated: false, completion: nil)
            }
        } catch let error {
            print(error.localizedDescription)
        }
    }

    /**
     Checks if the UPI app with the specified scheme is installed on the device.

     - Parameters:
        - scheme: The scheme of the UPI app to check.
        - resolve: The block to be called when the check is resolved.
        - reject: The block to be called when the check is rejected.

     - Returns: Void
     */
    @objc(checkInstalledUpiApp:withResolver:withRejecter:)
    func checkInstalledUpiApp(scheme: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        resolve(wlCheckout!.checkInstalledUpiApp(scheme: scheme))
    }
    
    /**
     Handles the payment response received from the Weipl Checkout.

     - Parameters:
        - result: The notification object containing the payment response as a string.

     - Throws: An error if there is an issue with parsing the payment response.

     - Note: This method expects the payment response to be a JSON string.
     */
    @objc func wlCheckoutPaymentResponse(result: Notification) {
        do {
            let jsonStringifiedString = result.object as! String
            let jsonStringifiedData = jsonStringifiedString.data(using: .utf8)
            let jsonDict = try JSONSerialization.jsonObject(with: jsonStringifiedData!, options: []) as! [String: Any]
            self.wlResponseCallback!([jsonDict])
        } catch let error {
            print(error.localizedDescription)
        }
    }
    
    /**
     Handles the payment error notification.

     - Parameters:
        - result: The notification object containing the error information in JSON format.

     - Throws: An error if there is an issue with JSON serialization.

     - Note: This method expects the notification object to be a string in JSON format. It deserializes the JSON string into a dictionary and calls the `wlErrorCallback` with the deserialized dictionary as an argument.
     */
    @objc func wlCheckoutPaymentError(result: Notification) {
        do {
            let jsonStringifiedString = result.object as! String
            let jsonStringifiedData = jsonStringifiedString.data(using: .utf8)
            let jsonDict = try JSONSerialization.jsonObject(with: jsonStringifiedData!, options: []) as! [String: Any]
            self.wlErrorCallback!([jsonDict])
        } catch let error {
            print(error.localizedDescription)
        }
    }
}
