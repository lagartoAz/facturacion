; Installer for the "Fidelidad" (loyalty points) add-on.
;
; It does NOT reinstall the app: it just drops the license file into the app's
; data folder. On the next launch the base app detects it and turns the add-on
; on (see syncLoyaltyLicense in src/main/index.ts).
;
; The key written below must match scripts/gen-loyalty-key.mjs for the "loyalty"
; feature. Regenerate it if LICENSE_SECRET changes.
;
; Build (on Windows or with nsis installed on Linux/Mac):
;   makensis installers/complemento-fidelidad.nsi
; Produces: installers/InstalarComplementoFidelidad.exe

!define LICENSE_KEY "FID-D2FEA-3C107-397CB"
!define DATA_DIR "$PROFILE\.facturacion-pos"

Name "Complemento Fidelidad - Facturacion POS"
OutFile "InstalarComplementoFidelidad.exe"
InstallDir "${DATA_DIR}"
RequestExecutionLevel user
SilentInstall normal

Page instfiles

Section "Activar Fidelidad"
  ; Ensure the data folder exists (it normally already does).
  CreateDirectory "${DATA_DIR}"
  ; Write the license file the base app looks for.
  FileOpen $0 "${DATA_DIR}\loyalty.license" w
  FileWrite $0 "${LICENSE_KEY}"
  FileClose $0
  MessageBox MB_OK "Complemento Fidelidad instalado.$\r$\n$\r$\nAbre (o reinicia) Facturacion POS y veras el menu 'Fidelidad'."
SectionEnd
