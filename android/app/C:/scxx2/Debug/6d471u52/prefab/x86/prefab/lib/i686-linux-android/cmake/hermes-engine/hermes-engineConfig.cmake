if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/muthuramanveerashekar/.gradle/caches/9.0.0/transforms/f39053a67f3901c225c0c84ebbba5a5d/transformed/hermes-android-0.14.1-debug/prefab/modules/hermesvm/libs/android.x86/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/muthuramanveerashekar/.gradle/caches/9.0.0/transforms/f39053a67f3901c225c0c84ebbba5a5d/transformed/hermes-android-0.14.1-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

