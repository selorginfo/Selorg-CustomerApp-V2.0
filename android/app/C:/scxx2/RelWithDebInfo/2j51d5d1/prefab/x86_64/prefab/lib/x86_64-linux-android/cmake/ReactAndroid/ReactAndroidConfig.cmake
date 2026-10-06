if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "/Users/sudesh/.gradle/caches/9.0.0/transforms/6018e9da3fa9930a2b4cfff0bedbea09/transformed/react-android-0.83.1-release/prefab/modules/hermestooling/libs/android.x86_64/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sudesh/.gradle/caches/9.0.0/transforms/6018e9da3fa9930a2b4cfff0bedbea09/transformed/react-android-0.83.1-release/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "/Users/sudesh/.gradle/caches/9.0.0/transforms/6018e9da3fa9930a2b4cfff0bedbea09/transformed/react-android-0.83.1-release/prefab/modules/jsi/libs/android.x86_64/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sudesh/.gradle/caches/9.0.0/transforms/6018e9da3fa9930a2b4cfff0bedbea09/transformed/react-android-0.83.1-release/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "/Users/sudesh/.gradle/caches/9.0.0/transforms/6018e9da3fa9930a2b4cfff0bedbea09/transformed/react-android-0.83.1-release/prefab/modules/reactnative/libs/android.x86_64/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sudesh/.gradle/caches/9.0.0/transforms/6018e9da3fa9930a2b4cfff0bedbea09/transformed/react-android-0.83.1-release/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

