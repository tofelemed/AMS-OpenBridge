using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Services;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class CredentialCipherTests
{
    private const string Key = "unit-test-master-key-0123456789abcdef";

    [Fact]
    public void RoundTrip_ReturnsOriginalPlaintext()
    {
        var cipher = new CredentialCipher(Key);
        var encrypted = cipher.Encrypt("s3cret-broker-p@ss");
        encrypted.Should().NotContain("s3cret");
        cipher.Decrypt(encrypted).Should().Be("s3cret-broker-p@ss");
    }

    [Fact]
    public void RoundTrip_EmptyString_Works()
    {
        var cipher = new CredentialCipher(Key);
        cipher.Decrypt(cipher.Encrypt("")).Should().Be("");
    }

    [Fact]
    public void Encrypt_SamePlaintextTwice_ProducesDifferentCiphertext()
    {
        var cipher = new CredentialCipher(Key);
        cipher.Encrypt("same").Should().NotBe(cipher.Encrypt("same"));
    }

    [Fact]
    public void Decrypt_TamperedCiphertext_Throws()
    {
        var cipher = new CredentialCipher(Key);
        var bytes = Convert.FromBase64String(cipher.Encrypt("value"));
        bytes[^1] ^= 0xFF;
        var tampered = Convert.ToBase64String(bytes);
        var act = () => cipher.Decrypt(tampered);
        act.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void Decrypt_WithDifferentKey_Throws()
    {
        var encrypted = new CredentialCipher(Key).Encrypt("value");
        var other = new CredentialCipher("another-master-key-0123456789abcdef00");
        var act = () => other.Decrypt(encrypted);
        act.Should().Throw<CryptographicException>();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("too-short")]
    public void Constructor_MissingOrShortKey_Throws(string? key)
    {
        var act = () => new CredentialCipher(key!);
        act.Should().Throw<InvalidOperationException>();
    }
}

public class TopicFilterTests
{
    [Theory]
    [InlineData("prm/data/#")]
    [InlineData("#")]
    [InlineData("+")]
    [InlineData("a/+/b")]
    [InlineData("prm/data/plant1/tag/unit/asset_event")]
    public void ValidFilters_Accepted(string filter) =>
        DataSourceValidation.IsValidTopicFilter(filter).Should().BeTrue();

    [Theory]
    [InlineData("a/#/b")]     // '#' not last
    [InlineData("a#")]        // '#' not a whole level
    [InlineData("a/b#")]
    [InlineData("a/b+")]      // '+' not a whole level
    [InlineData("a/+b/c")]
    [InlineData("")]
    [InlineData("   ")]
    public void InvalidFilters_Rejected(string filter) =>
        DataSourceValidation.IsValidTopicFilter(filter).Should().BeFalse();
}

public class ValidationTests
{
    private static CreateDataSourceRequest ValidCreate() => new()
    {
        ProfileType = "MQTT_PRM",
        Name = "OT Gateway broker",
        ConnectionUrl = "mqtts://192.168.190.91:8883",
        Username = "gateway",
        Password = "pw",
        ProfileConfig = new ProfileConfig { Mqtt = new MqttConfig { Topics = new List<string> { "prm/data/#" } } },
    };

    [Fact]
    public void ValidRequest_PassesValidation() =>
        DataSourceValidation.ValidateCreate(ValidCreate()).Should().BeNull();

    [Theory]
    [InlineData("mqtt://localhost")]
    [InlineData("mqtt://localhost:1883")]
    [InlineData("mqtts://192.168.190.91:8883")]
    [InlineData("mqtts://mosquitto:8883")]
    public void ValidUrls_Accepted(string url)
    {
        var request = ValidCreate();
        request.ConnectionUrl = url;
        DataSourceValidation.ValidateCreate(request).Should().BeNull();
    }

    [Theory]
    [InlineData("http://localhost:1883")]
    [InlineData("localhost:1883")]
    [InlineData("mqtt://")]
    [InlineData("mqtt://host:1883/path")]
    [InlineData("mqtt://host with space")]
    public void InvalidUrls_Rejected(string url)
    {
        var request = ValidCreate();
        request.ConnectionUrl = url;
        DataSourceValidation.ValidateCreate(request)!.Value.Field.Should().Be("connectionUrl");
    }

    [Fact]
    public void MissingRequiredFields_ReportTheOwningField()
    {
        var r1 = ValidCreate(); r1.Name = " ";
        DataSourceValidation.ValidateCreate(r1)!.Value.Field.Should().Be("name");

        var r2 = ValidCreate(); r2.Username = null;
        DataSourceValidation.ValidateCreate(r2)!.Value.Field.Should().Be("username");

        var r3 = ValidCreate(); r3.Password = null;
        DataSourceValidation.ValidateCreate(r3)!.Value.Field.Should().Be("password");

        var r4 = ValidCreate(); r4.ProfileType = "NOPE";
        DataSourceValidation.ValidateCreate(r4)!.Value.Field.Should().Be("profileType");

        var r5 = ValidCreate(); r5.ProfileConfig = new ProfileConfig();
        DataSourceValidation.ValidateCreate(r5)!.Value.Field.Should().Be("profileConfig");

        var r6 = ValidCreate(); r6.ProfileConfig!.Mqtt!.Topics = new List<string> { "  " };
        DataSourceValidation.ValidateCreate(r6)!.Value.Field.Should().Be("topics");
    }

    [Fact]
    public void InvalidQos_Rejected()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.Qos = 3;
        DataSourceValidation.ValidateCreate(request)!.Value.Field.Should().Be("qos");
    }

    [Fact]
    public void Topics_AreTrimmedAndBlanksDropped()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.Topics = new List<string> { "  prm/data/# ", "", "  " };
        DataSourceValidation.ValidateCreate(request).Should().BeNull();
        request.ProfileConfig!.Mqtt!.Topics.Should().Equal("prm/data/#");
    }

    [Fact]
    public void Tls_PemAndPathTogether_Rejected()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.Tls = new MqttTlsConfig
        {
            CaCertPem = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
            CaCertPath = "/certs/ca.crt",
        };
        DataSourceValidation.ValidateCreate(request)!.Value.Field.Should().Be("tls");
    }

    [Fact]
    public void Tls_SkipVerifyWithCa_Rejected()
    {
        var request = ValidCreate();
        request.InsecureSkipVerify = true;
        request.ProfileConfig!.Mqtt!.Tls = new MqttTlsConfig
        {
            CaCertPem = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
        };
        DataSourceValidation.ValidateCreate(request)!.Value.Field.Should().Be("tls");
    }

    [Fact]
    public void Tls_PemWithoutCertificateHeader_Rejected()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.Tls = new MqttTlsConfig { CaCertPem = "not a pem" };
        DataSourceValidation.ValidateCreate(request)!.Value.Error.Should().Contain("BEGIN CERTIFICATE");
    }

    [Fact]
    public void Tls_PemContainingPrivateKey_Rejected()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.Tls = new MqttTlsConfig
        {
            CaCertPem = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----\n-----BEGIN PRIVATE KEY-----",
        };
        DataSourceValidation.ValidateCreate(request)!.Value.Error.Should().Contain("never a key");
    }

    [Fact]
    public void Tls_OversizedPem_Rejected()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.Tls = new MqttTlsConfig
        {
            CaCertPem = "-----BEGIN CERTIFICATE-----" + new string('A', 70 * 1024),
        };
        DataSourceValidation.ValidateCreate(request)!.Value.Error.Should().Contain("64 KB");
    }

    [Fact]
    public void InvalidClientId_Rejected()
    {
        var request = ValidCreate();
        request.ProfileConfig!.Mqtt!.ClientId = "bad client id!";
        DataSourceValidation.ValidateCreate(request)!.Value.Field.Should().Be("clientId");
    }
}

public class DtoRedactionTests
{
    private static DataSourceRow Row() => new()
    {
        ConfigId = Guid.Parse("11111111-2222-3333-4444-555555555555"),
        Name = "OT Gateway broker",
        ConnectionUrl = "mqtts://192.168.190.91:8883",
        Username = "gateway",
        PasswordEncrypted = "AAAA-super-secret-ciphertext-AAAA",
        ProfileConfig = """{"mqtt":{"topics":["prm/data/#"],"qos":1}}""",
        CreatedBy = "admin",
    };

    [Fact]
    public void Dto_NeverExposesThePassword()
    {
        var json = JsonSerializer.Serialize(DataSourceDto.From(Row()));
        json.Should().NotContain("super-secret-ciphertext");
        json.Should().NotContainEquivalentOf("password_encrypted");
        JsonSerializer.Deserialize<JsonElement>(json).GetProperty("HasPassword").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public void EffectiveClientId_DerivedFromConfigId_WhenBlank()
    {
        var dto = DataSourceDto.From(Row());
        dto.EffectiveClientId.Should().Be("ingestion-11111111-2222-3333-4444-555555555555");
    }

    [Fact]
    public void EffectiveClientId_UsesExplicitClientId_WhenSet()
    {
        var row = Row();
        row.ProfileConfig = """{"mqtt":{"topics":["prm/data/#"],"client_id":"ingestion-ww"}}""";
        DataSourceDto.From(row).EffectiveClientId.Should().Be("ingestion-ww");
    }

    [Fact]
    public void ProfileConfig_MalformedStoredJson_ToleratedAsEmpty()
    {
        var row = Row();
        row.ProfileConfig = "{not json";
        var dto = DataSourceDto.From(row);
        dto.ProfileConfig.Mqtt.Should().BeNull();
        dto.EffectiveClientId.Should().StartWith("ingestion-");
    }

    [Fact]
    public void ProfileConfig_SnakeCaseContract_RoundTrips()
    {
        var config = new ProfileConfig
        {
            Mqtt = new MqttConfig
            {
                Topics = new List<string> { "prm/data/#" },
                Qos = 1,
                CleanSession = false,
                SessionExpirySeconds = 86400,
                KeepaliveSeconds = 60,
                Tls = new MqttTlsConfig { Servername = "mosquitto" },
            },
        };
        var json = config.ToJson();
        json.Should().Contain("\"session_expiry_seconds\":86400");
        json.Should().Contain("\"clean_session\":false");
        json.Should().Contain("\"servername\":\"mosquitto\"");
        var back = ProfileConfig.FromJson(json);
        back.Mqtt!.SessionExpirySeconds.Should().Be(86400);
        back.Mqtt!.Tls!.Servername.Should().Be("mosquitto");
    }
}
