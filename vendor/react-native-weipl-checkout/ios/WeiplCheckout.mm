#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WeiplCheckout, NSObject)

RCT_EXTERN_METHOD(open:(NSDictionary) option
                 withResponseCallback:(RCTResponseSenderBlock) responseCallback
                 withErrorCallback:(RCTResponseSenderBlock) errorCallback)

RCT_EXTERN_METHOD(checkInstalledUpiApp:(NSString) scheme
                 withResolver:(RCTPromiseResolveBlock) resolve
                 withRejecter:(RCTPromiseRejectBlock) reject)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
