package com.facturacion.acceso;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

// Shares a file (an invoice/quote PDF) straight to WhatsApp via an ACTION_SEND
// intent. Falls back to WhatsApp Business and then the system share sheet when
// WhatsApp isn't installed, so the button never dead-ends.
@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {

    @PluginMethod
    public void shareToWhatsApp(PluginCall call) {
        String base64 = call.getString("base64");
        String fileName = call.getString("fileName", "recibo.pdf");
        String mimeType = call.getString("mimeType", "application/pdf");
        String caption = call.getString("caption", "");

        if (base64 == null) {
            call.reject("Falta el contenido del archivo");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, fileName);
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(bytes);
            fos.close();

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent base = new Intent(Intent.ACTION_SEND);
            base.setType(mimeType);
            base.putExtra(Intent.EXTRA_STREAM, uri);
            if (caption != null && !caption.isEmpty()) {
                base.putExtra(Intent.EXTRA_TEXT, caption);
            }
            base.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            String[] packages = { "com.whatsapp", "com.whatsapp.w4b" };
            boolean launched = false;
            for (String pkg : packages) {
                Intent scoped = new Intent(base);
                scoped.setPackage(pkg);
                if (scoped.resolveActivity(getContext().getPackageManager()) != null) {
                    scoped.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(scoped);
                    launched = true;
                    break;
                }
            }

            if (!launched) {
                Intent chooser = Intent.createChooser(base, "Compartir");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }

            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir: " + e.getMessage());
        }
    }
}
