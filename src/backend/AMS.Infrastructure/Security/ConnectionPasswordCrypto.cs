using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace AMS.Infrastructure.Security;

public sealed class ConnectionPasswordCrypto
{
    private readonly byte[] _key;

    public ConnectionPasswordCrypto(IConfiguration config)
    {
        var keyMaterial = config["Security:ConnectionPasswordKey"] ?? "ams-dev-connection-key-32bytes!!";
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(keyMaterial));
    }

    public byte[]? Encrypt(string? password)
    {
        if (string.IsNullOrWhiteSpace(password)) return null;
        using var aes = Aes.Create();
        aes.Key = _key;
        aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor();
        var plain = Encoding.UTF8.GetBytes(password);
        var cipher = encryptor.TransformFinalBlock(plain, 0, plain.Length);
        var payload = new byte[aes.IV.Length + cipher.Length];
        Buffer.BlockCopy(aes.IV, 0, payload, 0, aes.IV.Length);
        Buffer.BlockCopy(cipher, 0, payload, aes.IV.Length, cipher.Length);
        return payload;
    }

    public string? Decrypt(byte[]? payload)
    {
        if (payload is null || payload.Length < 17) return null;
        using var aes = Aes.Create();
        aes.Key = _key;
        var iv = new byte[16];
        Buffer.BlockCopy(payload, 0, iv, 0, 16);
        aes.IV = iv;
        var cipher = new byte[payload.Length - 16];
        Buffer.BlockCopy(payload, 16, cipher, 0, cipher.Length);
        using var decryptor = aes.CreateDecryptor();
        var plain = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);
        return Encoding.UTF8.GetString(plain);
    }
}
