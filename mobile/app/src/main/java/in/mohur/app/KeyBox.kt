package `in`.mohur.app

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Seals the signing key with a key that never leaves the phone's secure hardware. */
interface KeyBox {
    fun seal(plain: String): String
    fun open(sealed: String): String

    companion object {
        var instance: KeyBox = Keystore
    }

    private object Keystore : KeyBox {
        private const val ALIAS = "mohur"
        private fun key(): SecretKey {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
                init(
                    KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build(),
                )
                generateKey()
            }
        }

        override fun seal(plain: String): String = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, key())
            Base64.encodeToString(iv + doFinal(plain.toByteArray()), Base64.NO_WRAP)
        }

        override fun open(sealed: String): String {
            val raw = Base64.decode(sealed, Base64.NO_WRAP)
            return Cipher.getInstance("AES/GCM/NoPadding").run {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw, 0, 12))
                String(doFinal(raw, 12, raw.size - 12))
            }
        }
    }
}
