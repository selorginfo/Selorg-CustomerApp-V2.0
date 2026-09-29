if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/sudesh/.gradle/caches/9.0.0/transforms/2a1c0f08dcb60616d0a772fc7efbeceb/transformed/hermes-android-0.14.0-debug/prefab/modules/hermesvm/libs/android.armeabi-v7a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sudesh/.gradle/caches/9.0.0/transforms/2a1c0f08dcb60616d0a772fc7efbeceb/transformed/hermes-android-0.14.0-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

