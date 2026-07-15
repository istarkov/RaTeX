// RaTeXModule.kt (Old Architecture) — bridge module with a blocking sync method,
// mirroring the codegen-generated spec the new-arch class extends.

package io.ratex

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = RaTeXModuleImpl.NAME)
class RaTeXModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = RaTeXModuleImpl.NAME

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getTexMetrics(
        latex: String,
        fontSize: Double,
        displayMode: Boolean,
        color: Double,
    ): WritableMap? =
        RaTeXModuleImpl.getTexMetrics(reactApplicationContext, latex, fontSize, displayMode, color)
}
