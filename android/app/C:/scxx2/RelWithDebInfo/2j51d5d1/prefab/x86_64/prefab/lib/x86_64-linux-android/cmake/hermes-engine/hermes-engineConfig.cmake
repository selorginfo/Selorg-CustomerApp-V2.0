if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/sudesh/.gradle/caches/9.0.0/transforms/ad930ce90671cc97c5bc94d7777d93a3/transformed/hermes-android-0.14.0-release/prefab/modules/hermesvm/libs/android.x86_64/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sudesh/.gradle/caches/9.0.0/transforms/ad930ce90671cc97c5bc94d7777d93a3/transformed/hermes-android-0.14.0-release/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

