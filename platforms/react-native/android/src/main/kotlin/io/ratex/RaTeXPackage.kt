// RaTeXPackage.kt — ReactPackage registration for RaTeX React Native module.

package io.ratex

import com.facebook.react.BaseReactPackage
import io.ratex.rn.BuildConfig
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class RaTeXPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        when (name) {
            RaTeXModuleImpl.NAME -> RaTeXModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                RaTeXModuleImpl.NAME to ReactModuleInfo(
                    RaTeXModuleImpl.NAME,
                    RaTeXModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, // isTurboModule
                ),
            )
        }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf<ViewManager<*, *>>(
            RaTeXViewManager(reactContext),
            RaTeXInlineViewManager(reactContext),
        )
}
