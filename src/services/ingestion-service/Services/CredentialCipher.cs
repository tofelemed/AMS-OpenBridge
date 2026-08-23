using System.Security.Cryptography;

namespace Traverse.IngestionService.Services;

/// <summary>
/// AES-256-GCM credential encryption (spec §4 port). Output layout is
/// base64(salt(64) ‖ nonce(12) ‖ tag(16) ‖ ciphertext); the per-value key is
/// PBKDF2(SHA-256, 100k iterations) of the master key over the fresh salt.
/// The .NET nonce is 12 bytes (AesGcm requirement; the Node original used 16 —
/// no stored-data compatibility is needed, the store starts empty here).
///
/// INVARIANT: decrypted values exist only in memory inside this service (the
/// connection tester now, the subscriber in phase 2) — never in a response,
/// a log line, or an audit event. Rotating the master key orphans every stored
/// password; operators must re-enter them.
/// </summary>
public sealed class CredentialCipher
{
    private const int SaltLength = 64;
    private const int NonceLength = 12;
    private const int TagLength = 16;
    private const int KeyLength = 32;
    private const int Pbkdf2Iterations = 100_000;

    private readonly string _masterKey;

    public CredentialCipher(string masterKey)
    {
        if (string.IsNullOrEmpty(masterKey))
            throw new InvalidOperationException("ENCRYPTION_KEY is not set");
        if (masterKey.Length < 32)
            throw new InvalidOperationException("ENCRYPTION_KEY must be at least 32 characters long");
        _masterKey = masterKey[..32];
    }

    public string Encrypt(string plaintext)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var key = DeriveKey(salt);
        var nonce = RandomNumberGenerator.GetBytes(NonceLength);
        var plainBytes = System.Text.Encoding.UTF8.GetBytes(plaintext);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[TagLength];

        using var gcm = new AesGcm(key, TagLength);
        gcm.Encrypt(nonce, plainBytes, cipherBytes, tag);

        var combined = new byte[SaltLength + NonceLength + TagLength + cipherBytes.Length];
        salt.CopyTo(combined, 0);
        nonce.CopyTo(combined, SaltLength);
        tag.CopyTo(combined, SaltLength + NonceLength);
        cipherBytes.CopyTo(combined, SaltLength + NonceLength + TagLength);
        return Convert.ToBase64String(combined);
    }

    public string Decrypt(string encryptedData)
    {
        var combined = Convert.FromBase64String(encryptedData);
        if (combined.Length < SaltLength + NonceLength + TagLength)
            throw new CryptographicException("Encrypted payload is too short");

        var salt = combined.AsSpan(0, SaltLength).ToArray();
        var nonce = combined.AsSpan(SaltLength, NonceLength).ToArray();
        var tag = combined.AsSpan(SaltLength + NonceLength, TagLength).ToArray();
        var cipherBytes = combined.AsSpan(SaltLength + NonceLength + TagLength).ToArray();
        var plainBytes = new byte[cipherBytes.Length];

        var key = DeriveKey(salt);
        using var gcm = new AesGcm(key, TagLength);
        gcm.Decrypt(nonce, cipherBytes, tag, plainBytes);
        return System.Text.Encoding.UTF8.GetString(plainBytes);
    }

    private byte[] DeriveKey(byte[] salt) =>
        Rfc2898DeriveBytes.Pbkdf2(_masterKey, salt, Pbkdf2Iterations, HashAlgorithmName.SHA256, KeyLength);
}
