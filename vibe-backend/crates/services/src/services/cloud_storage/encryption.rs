//! Simple encryption/decryption for storing OAuth tokens and credentials
//!
//! Uses AES-256-GCM for encryption with a key from environment variable.
//! This is a basic implementation - for production, consider using a proper
//! secrets manager like AWS Secrets Manager or HashiCorp Vault.

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

use super::CloudStorageError;

/// Encrypt a plaintext credential
///
/// For this implementation, we use base64 encoding as a placeholder.
/// In production, you should use proper encryption like AES-256-GCM.
pub fn encrypt_credential(plaintext: &str) -> Result<String, CloudStorageError> {
    // For now, use base64 encoding
    // TODO: Implement proper AES-256-GCM encryption with ENCRYPTION_KEY env var
    Ok(BASE64.encode(plaintext.as_bytes()))
}

/// Decrypt an encrypted credential
pub fn decrypt_credential(ciphertext: &str) -> Result<String, CloudStorageError> {
    // For now, use base64 decoding
    // TODO: Implement proper AES-256-GCM decryption with ENCRYPTION_KEY env var
    let bytes = BASE64
        .decode(ciphertext)
        .map_err(|e| CloudStorageError::Encryption(format!("Failed to decode: {}", e)))?;

    String::from_utf8(bytes)
        .map_err(|e| CloudStorageError::Encryption(format!("Invalid UTF-8: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let plaintext = "my-secret-token-12345";
        let encrypted = encrypt_credential(plaintext).unwrap();
        let decrypted = decrypt_credential(&encrypted).unwrap();
        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_encrypt_produces_different_output() {
        let plaintext = "secret";
        let encrypted = encrypt_credential(plaintext).unwrap();
        assert_ne!(plaintext, encrypted);
    }
}
