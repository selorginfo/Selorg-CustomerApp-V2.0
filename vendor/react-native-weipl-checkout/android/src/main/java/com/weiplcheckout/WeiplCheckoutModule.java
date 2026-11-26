package com.weiplcheckout;

import androidx.annotation.NonNull;

import android.app.Activity;
import android.content.Intent;
import android.os.AsyncTask;
import android.os.CountDownTimer;
import android.util.Log;

import com.facebook.react.bridge.Promise;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.UiThreadUtil;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.Arguments;

import com.weipl.checkout.WLCheckoutActivity;

import java.math.BigInteger;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.Map;
import java.util.logging.Handler;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;


/**
 * This module provides integration with the Worldline ePayments India SDK for React Native.
 * It allows for initiating the checkout process, handling payment responses, and retrieving the list of UPI apps installed on the device in the Android platform.
 */
@ReactModule(name = WeiplCheckoutModule.NAME)
public class WeiplCheckoutModule extends ReactContextBaseJavaModule implements WLCheckoutActivity.PaymentResponseListener {
    public static final String NAME = "WeiplCheckout";

    static ReactApplicationContext appContext;

    private static Callback wlResponseCallback;
    private static Callback wlErrorCallback;

    public WeiplCheckoutModule(ReactApplicationContext reactContext) {
        super(reactContext);
		appContext = reactContext;
        WLCheckoutActivity.setPaymentResponseListener(this);
    }

	/**
	* Returns the name of the module.
	*
	* @return the name of the module as a String
	*/
    @Override
    @NonNull
    public String getName() {
        return NAME;
    }
	

	/**
	 * Initiates Checkout SDK
	 *
	 * @param options          The options for checkout initialization.
	 * @param responseCallback The callback to be invoked when the checkout is successful.
	 * @param errorCallback   The callback to be invoked when an error occurs during checkout.
	 */
    @ReactMethod
    public void open(ReadableMap options, Callback responseCallback, Callback errorCallback) {

        wlResponseCallback = responseCallback;
        wlErrorCallback = errorCallback;

		if (options == null) {
			WritableMap retResponse = new WritableNativeMap();
			retResponse.putString("error_code", "0399");
			retResponse.putString("error_desc", "Expected checkout initialisation options");
			wlErrorCallback.invoke(retResponse);
            return;
        }

		UiThreadUtil.runOnUiThread(() -> {
			try {
				JSONObject reqJSON = readableMapToJson(options);
				WLCheckoutActivity.open(getCurrentActivity(), reqJSON);
			} catch (Exception e) {
				Log.d("error in invocation: ", e.getLocalizedMessage());
			}
		});
    }

	/**
	 * Retrieves the list of UPI (Unified Payments Interface) apps installed on the device.
	 * 
	 * @param promise A Promise object that will be resolved with the list of UPI apps or an error message.
	 * @return void
	 */
	@ReactMethod
    public void upiIntentAppsList(Promise promise) {
		JSONArray upiIntentResponse = WLCheckoutActivity.getUPIResponse(getCurrentActivity());
		if (upiIntentResponse == null) {
            String emptyResponse = "No UPI Apps found!";

			WritableMap retResponse = new WritableNativeMap();
			retResponse.putString("error_code", "0399");
			retResponse.putString("error_desc", emptyResponse);

			promise.resolve(retResponse);
			return;
        }

		try {
			WritableMap retResponse = new WritableNativeMap();
			retResponse.putArray("appsList", jsonToWritableArray(upiIntentResponse));

			promise.resolve(retResponse);
        } catch (Exception e) {
            Log.d(NAME, "Got error in upiIntentAppsList()");
        }
    }

	/**
	 * Handles the payment response for the wlCheckoutPayment method.
	 * This method is called when a payment response is received.
	 *
	 * @param jsonObject The JSON object containing the payment response.
	 */
	@Override
	public void wlCheckoutPaymentResponse(JSONObject jsonObject) {
		UiThreadUtil.runOnUiThread(() -> {
			try {
				wlResponseCallback.invoke(jsonToWritableMap(jsonObject));
			} catch (Exception e) {
				Log.d(NAME, "Got error in wlCheckoutPaymentResponse()");
			}
		});
	}

	/**
	 * Callback method invoked when there is an error during the payment process.
	 * 
	 * @param jsonObject The JSON object containing the error details.
	 */
	@Override
	public void wlCheckoutPaymentError(JSONObject jsonObject) {
		UiThreadUtil.runOnUiThread(() -> {
			try {
				wlErrorCallback.invoke(jsonToWritableMap(jsonObject));
			} catch (Exception e) {
				Log.d(NAME, "Got error in wlCheckoutPaymentError()");
			}
		});
	}

	/**
	 * Converts a ReadableMap object to a JSONObject.
	 *
	 * @param readableMap The ReadableMap object to be converted.
	 * @return The converted JSONObject.
	 */
    private static JSONObject readableMapToJson(ReadableMap readableMap) {
		JSONObject object = new JSONObject();
		try {
			ReadableMapKeySetIterator iterator = readableMap.keySetIterator();
			while (iterator.hasNextKey()) {
				String key = iterator.nextKey();
				switch (readableMap.getType(key)) {
					case Null:
					object.put(key, JSONObject.NULL);
					break;
					case Boolean:
					object.put(key, readableMap.getBoolean(key));
					break;
					case Number:
					object.put(key, readableMap.getDouble(key));
					break;
					case String:
					object.put(key, readableMap.getString(key));
					break;
					case Map:
					object.put(key, readableMapToJson(readableMap.getMap(key)));
					break;
					case Array:
					object.put(key, readableArrayToJson(readableMap.getArray(key)));
					break;
				}
			}

		} catch(JSONException e){
            // do nothing
		}
		return object;
	}

	/**
	 * Converts a ReadableArray to a JSONArray.
	 *
	 * @param readableArray The ReadableArray to convert.
	 * @return The converted JSONArray.
	 * @throws JSONException If there is an error during the conversion.
	 */
    private static JSONArray readableArrayToJson(ReadableArray readableArray) throws JSONException {
		JSONArray array = new JSONArray();
		for (int i = 0; i < readableArray.size(); i++) {
			switch (readableArray.getType(i)) {
				case Null:
				break;
				case Boolean:
				array.put(readableArray.getBoolean(i));
				break;
				case Number:
				array.put(readableArray.getDouble(i));
				break;
				case String:
				array.put(readableArray.getString(i));
				break;
				case Map:
				array.put(readableMapToJson(readableArray.getMap(i)));
				break;
				case Array:
				array.put(readableArrayToJson(readableArray.getArray(i)));
				break;
			}
		}
		return array;
	}

	/**
	 * Converts a JSON object to a WritableMap.
	 *
	 * @param jsonObject The JSON object to convert.
	 * @return The converted WritableMap.
	 */
	private static WritableMap jsonToWritableMap(JSONObject jsonObject) {
		WritableMap writableMap = new WritableNativeMap();
		try {
			Iterator<String> iterator = jsonObject.keys();
			while(iterator.hasNext()) {
				String key = iterator.next();
				Object value = jsonObject.get(key);
				if (value instanceof Float || value instanceof Double) {
					writableMap.putDouble(key, jsonObject.getDouble(key));
				} else if (value instanceof Number) {
					writableMap.putInt(key, jsonObject.getInt(key));
				} else if (value instanceof String) {
					writableMap.putString(key, jsonObject.getString(key));
				} else if (value instanceof JSONObject) {
					writableMap.putMap(key, jsonToWritableMap(jsonObject.getJSONObject(key)));
				} else if (value instanceof JSONArray){
					writableMap.putArray(key, jsonToWritableArray(jsonObject.getJSONArray(key)));
				} else if (value == JSONObject.NULL){
					writableMap.putNull(key);
				}
			}
		} catch(JSONException e){
            // do nothing
		}
		return writableMap;
	}

	/**
	 * Converts a JSONArray to a WritableArray.
	 *
	 * @param jsonArray the JSONArray to convert
	 * @return the converted WritableArray
	 */
	private static WritableArray jsonToWritableArray(JSONArray jsonArray) {
		WritableArray writableArray = new WritableNativeArray();
		try {
			for(int i=0; i < jsonArray.length(); i++) {
				Object value = jsonArray.get(i);
				if (value instanceof Float || value instanceof Double) {
					writableArray.pushDouble(jsonArray.getDouble(i));
				} else if (value instanceof Number) {
					writableArray.pushInt(jsonArray.getInt(i));
				} else if (value instanceof String) {
					writableArray.pushString(jsonArray.getString(i));
				} else if (value instanceof JSONObject) {
					writableArray.pushMap(jsonToWritableMap(jsonArray.getJSONObject(i)));
				} else if (value instanceof JSONArray){
					writableArray.pushArray(jsonToWritableArray(jsonArray.getJSONArray(i)));
				} else if (value == JSONObject.NULL){
					writableArray.pushNull();
				}
			}
		} catch(JSONException e){
            // do nothing
		}
		return writableArray;
	}
}
