# OPC Gateway — Windows edge deployment

Classic OPC A&E ACK runs on **Windows x86**, not in Linux Docker.

## One-time per production server

1. Obtain OPC Foundation **Core Components** (MSI or x86 DLL set) under license.
2. Either:
   - Copy MSI to `third-party/opc-core-redist/installers/`, or
   - On a machine that already has OPC Core installed:
     ```powershell
     e:\AMS\scripts\capture-opc-core-redist.ps1
     ```
3. On each edge host (elevated PowerShell):
   ```powershell
   e:\AMS\scripts\install-opc-core-redist.ps1
   ```
4. Confirm: `Test-Path C:\Windows\SysWOW64\opcaeps.dll` → `True`
5. Install/start AMS OPC Gateway (x86) as a Windows Service.

## Gateway startup (lab / prod)

```powershell
e:\AMS\scripts\ensure-opc-ae-lab.ps1 -StartSimulator   # lab only
Get-Process AMS.OpcGateway -ErrorAction SilentlyContinue | Stop-Process -Force
cd e:\AMS\src\opc-gateway\AMS.OpcGateway
$env:ASPNETCORE_ENVIRONMENT = 'StreamPipes'
dotnet run
```

Administration → OPC servers: `IntegrationObjects.OPCAEServer.Simulator.1`, host = machine name.
