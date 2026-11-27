if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "/Users/muthuramanveerashekar/.gradle/caches/9.0.0/transforms/9780868a66e5316b117ebd3cbe09ee0d/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.arm64-v8a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/muthuramanveerashekar/.gradle/caches/9.0.0/transforms/9780868a66e5316b117ebd3cbe09ee0d/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

