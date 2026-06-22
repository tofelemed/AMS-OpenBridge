# OPC Core Components (Classic A&E marshaling)

AMS OPC Gateway (32-bit, Classic OPC A&E ACK) requires **OPC Foundation Core Components**, including:

| File | Role |
|------|------|
| `opcaeps.dll` | OPC A&E proxy/stub (required for `IOPCEventServer`) |
| `opccomn_ps.dll` | OPC common proxy/stub |
| `opcproxy.dll` | OPC DA proxy |

On 64-bit Windows these live under `C:\Windows\SysWOW64\` after a proper install.

## License

Binaries are **OPC Foundation redistributables**. Obtain them under the [OPC Redistributable Agreement](https://opcfoundation.org/developer-tools/samples-and-tools-classic/core-components/). Do not commit OPC DLLs to git unless your organization is licensed to redistribute them.

## Bundle for production (recommended)

**Option A — MSI (best)**  
Place the official installer here (gitignored):

```
third-party/opc-core-redist/installers/OPCCoreRedistributable*.msi
```

Run on each Windows edge host (once):

```powershell
e:\AMS\scripts\install-opc-core-redist.ps1
```

**Option B — x86 DLL set**  
After installing OPC Core on a build machine, capture files:

```powershell
e:\AMS\scripts\capture-opc-core-redist.ps1
```

This copies `opcaeps.dll`, `opccomn_ps.dll`, and `opcproxy.dll` into `third-party/opc-core-redist/x86/`. Ship that folder with the gateway installer; `install-opc-core-redist.ps1` registers them into `SysWOW64`.

## Not for Linux Docker

Classic OPC A&E uses **Windows COM**. The AMS gateway ACK path runs as a **Windows x86 service/process** on the plant edge, not inside `ams-api` / StreamPipes Linux containers.
