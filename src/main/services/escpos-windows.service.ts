// Sends a raw ESC/POS byte stream straight to an installed Windows printer queue
// using the print spooler with the "RAW" datatype. This BYPASSES the GDI/driver
// rendering path (webContents.print), which on cheap 58mm thermal printers emits
// a line of garbage control symbols before the receipt. By writing RAW bytes we
// control every byte the printer receives, so it prints cleanly and immediately.
//
// No native module is needed: we drive the Win32 spooler API (winspool.drv) from
// a short-lived PowerShell process with an inline C# type (Add-Type). The printer
// stays installed with its normal Windows driver — no WinUSB/Zadig reconfig.

import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

// Inline C# that P/Invokes OpenPrinter/StartDocPrinter/WritePrinter with a RAW
// document. Printer name + byte file arrive via environment variables so we never
// interpolate user-controlled strings into the script (no quoting/injection risk).
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$src = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class FactRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern bool StartDocPrinter(IntPtr h, int level, [In] ref DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static void Send(string name, byte[] bytes) {
    IntPtr h;
    if(!OpenPrinter(name, out h, IntPtr.Zero))
      throw new Exception("No se pudo abrir la impresora (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Factura";
      di.pDataType = "RAW";
      if(!StartDocPrinter(h, 1, ref di))
        throw new Exception("StartDocPrinter fallo (" + Marshal.GetLastWin32Error() + ")");
      try {
        if(!StartPagePrinter(h))
          throw new Exception("StartPagePrinter fallo (" + Marshal.GetLastWin32Error() + ")");
        int written;
        if(!WritePrinter(h, bytes, bytes.Length, out written))
          throw new Exception("WritePrinter fallo (" + Marshal.GetLastWin32Error() + ")");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($env:FACT_FILE)
[FactRawPrinter]::Send($env:FACT_PRINTER, $bytes)
Write-Output 'FACT_OK'
`

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export async function sendRawToWindowsPrinter(
  printerName: string,
  bytes: Uint8Array
): Promise<void> {
  if (!isWindows()) {
    throw new Error('La impresion ESC/POS directa solo esta disponible en Windows')
  }
  if (!printerName) {
    throw new Error('No hay impresora seleccionada para la impresion termica')
  }

  const tmpFile = join(app.getPath('temp'), `factura-escpos-${process.pid}-${Date.now()}.bin`)
  await writeFile(tmpFile, Buffer.from(bytes))

  try {
    await new Promise<void>((resolve, reject) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
        { env: { ...process.env, FACT_PRINTER: printerName, FACT_FILE: tmpFile } }
      )

      let stdout = ''
      let stderr = ''
      ps.stdout.on('data', (d) => (stdout += d.toString()))
      ps.stderr.on('data', (d) => (stderr += d.toString()))
      ps.on('error', (err) =>
        reject(new Error(`No se pudo ejecutar la impresion: ${err.message}`))
      )
      ps.on('close', (code) => {
        if (code === 0 && stdout.includes('FACT_OK')) {
          resolve()
        } else {
          const detail = (stderr || stdout).trim().split('\n').slice(0, 3).join(' ')
          reject(new Error(detail || `La impresion termina con codigo ${code}`))
        }
      })
    })
  } finally {
    void unlink(tmpFile).catch(() => {
      /* temp file cleanup is best-effort */
    })
  }
}
