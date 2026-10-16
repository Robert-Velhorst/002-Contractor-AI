package nl.contractorai.field;

import android.app.KeyguardManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.UUID;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FieldStore {
    static final long TTL = 7L * 24 * 60 * 60 * 1000;
    static final int MAX_VAULT = 24 * 1024 * 1024;
    static final int MAX_PHOTO = 2 * 1024 * 1024;
    private static final String[] PHOTO_PHASES = {"before", "during", "after"};
    private final Context context;
    private final AtomicFile vault;
    String origin = "";
    String token = "";
    String companyId = "";
    String ledgerId = "";
    FieldStore(Context context) { this.context = context; vault = new AtomicFile(new File(context.getFilesDir(), "work-vault.gcm")); }

    static String origin(String input) throws Exception {
        URI uri = new URI(input.trim());
        boolean localDebug = BuildConfig.DEBUG && "http".equals(uri.getScheme()) && ("127.0.0.1".equals(uri.getHost()) || "10.0.2.2".equals(uri.getHost()));
        if ((!"https".equals(uri.getScheme()) && !localDebug) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
            || uri.getFragment() != null || (!uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) throw new IOException("Gebruik een HTTPS-serveradres zonder pad, login of parameters.");
        return uri.getScheme() + "://" + uri.getRawAuthority();
    }
    static boolean requiresLocalNetworkPermission(String host) throws UnknownHostException {
        if (host == null) return false;
        String normalized = host.toLowerCase(java.util.Locale.ROOT);
        if ("localhost".equals(normalized) || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
        for (InetAddress address : InetAddress.getAllByName(host)) {
            if (address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress()) return true;
            byte[] bytes = address.getAddress();
            if (bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc) return true;
        }
        return false;
    }
    byte[] request(String path, JSONObject body, int maximum, String requiredType) throws Exception {
        if (token.isEmpty()) throw new IOException("Meld je opnieuw aan met je uitvoerdersaccount.");
        if (!path.startsWith("/api/") || path.startsWith("//")) throw new IOException("Ongeldig API-pad.");
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        if (!companyId.isEmpty() && !ledgerId.isEmpty()) {
            connection.setRequestProperty("X-Contractor-Company", companyId);
            connection.setRequestProperty("X-Contractor-Ledger", ledgerId);
        }
        try {
            if (body != null) { connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream stream = connection.getOutputStream()) { stream.write(body.toString().getBytes(StandardCharsets.UTF_8)); } }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new ApiError(status);
            if (requiredType != null && !requiredType.equals(connection.getContentType() == null ? "" : connection.getContentType().split(";")[0])) throw new IOException("Onverwacht bestandstype.");
            try (InputStream stream = connection.getInputStream()) { return bounded(stream, maximum); }
        } finally { connection.disconnect(); }
    }
    JSONObject json(String path, JSONObject body) throws Exception { return new JSONObject(new String(request(path, body, 5 * 1024 * 1024, "application/json"), StandardCharsets.UTF_8)); }
    byte[] uploadPhoto(String path, JSONObject fields, byte[] photo, String filename, String entryKey) throws Exception {
        if (photo.length < 12 || photo.length > MAX_PHOTO || !jpeg(photo)) throw new IOException("De foto is ongeldig of groter dan 2 MB.");
        String boundary = "ContractorAI" + UUID.randomUUID().toString().replace("-", "");
        ByteArrayOutputStream body = new ByteArrayOutputStream(photo.length + 2048);
        String[] names = {"jobId", "category", "photoEvidenceSetId", "photoEvidencePhase", "photoEvidenceEntryKey", "capturedAt", "notes"};
        for (String name : names) writePart(body, boundary, name, fields.getString(name));
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"evidenceFile\"; filename=\"" + filename
            + "\"\r\nContent-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(photo);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpURLConnection connection = (HttpURLConnection) new URL(origin + path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.size());
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("X-Contractor-Company", companyId);
        connection.setRequestProperty("X-Contractor-Ledger", ledgerId);
        connection.setRequestProperty("Idempotency-Key", entryKey);
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        try {
            try (OutputStream stream = connection.getOutputStream()) { body.writeTo(stream); }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new ApiError(status);
            if (!"application/json".equals(connection.getContentType() == null ? "" : connection.getContentType().split(";")[0])) throw new IOException("Onverwacht antwoord van de fotoserver.");
            try (InputStream stream = connection.getInputStream()) { return bounded(stream, 1024 * 1024); }
        } finally { connection.disconnect(); }
    }
    private static void writePart(OutputStream output, String boundary, String name, String value) throws IOException {
        output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n").getBytes(StandardCharsets.UTF_8));
    }
    static boolean jpeg(byte[] bytes) { return bytes.length >= 3 && (bytes[0] & 255) == 0xff && (bytes[1] & 255) == 0xd8 && (bytes[2] & 255) == 0xff; }
    static byte[] normalizePhoto(File file) throws Exception {
        if (!file.isFile() || file.length() < 12 || file.length() > 40L * 1024 * 1024) throw new IOException("De tijdelijke camerafoto is leeg of groter dan 40 MB.");
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        if (bounds.outWidth < 1 || bounds.outHeight < 1 || bounds.outWidth > 16000 || bounds.outHeight > 16000) throw new IOException("De camera heeft geen geldige foto gemaakt.");
        int sample = 1;
        while (bounds.outWidth / sample > 2560 || bounds.outHeight / sample > 2560) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = sample; options.inPreferredConfig = Bitmap.Config.RGB_565;
        Bitmap decoded = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (decoded == null) throw new IOException("De gemaakte foto kan niet worden gelezen.");
        Bitmap oriented = decoded;
        try {
            int orientation = new ExifInterface(file.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            float degrees = orientation == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : orientation == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : orientation == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            if (degrees != 0) { Matrix matrix = new Matrix(); matrix.postRotate(degrees); oriented = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true); }
            for (int attempt = 0; attempt < 5; attempt++) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                int quality = 88 - attempt * 7;
                if (!oriented.compress(Bitmap.CompressFormat.JPEG, quality, output)) throw new IOException("Foto comprimeren is mislukt.");
                byte[] bytes = output.toByteArray();
                if (bytes.length <= MAX_PHOTO) return bytes;
                if (attempt < 4) {
                    Bitmap smaller = Bitmap.createScaledBitmap(oriented, Math.max(1, oriented.getWidth() * 3 / 4), Math.max(1, oriented.getHeight() * 3 / 4), true);
                    if (oriented != decoded) oriented.recycle();
                    oriented = smaller;
                }
            }
            throw new IOException("De foto kan niet veilig tot 2 MB worden verkleind.");
        } finally {
            if (oriented != decoded && !oriented.isRecycled()) oriented.recycle();
            if (!decoded.isRecycled()) decoded.recycle();
        }
    }
    static String nextPhotoPhase(JSONObject pack, String setId) throws Exception {
        return nextPhotoPhase(pack, setId, null);
    }
    static String nextPhotoPhase(JSONObject pack, String setId, JSONArray queuedEntries) throws Exception {
        JSONObject selected = null;
        JSONArray sets = pack.optJSONObject("checks") == null ? null : pack.optJSONObject("checks").optJSONArray("photos");
        if (sets != null) for (int i = 0; i < sets.length(); i++) if (setId.equals(sets.getJSONObject(i).optString("id"))) selected = sets.getJSONObject(i);
        if (selected == null) throw new IOException("Deze fotoset staat niet in het toegewezen werkpakket.");
        JSONArray required = selected.optJSONArray("requiredPhases"), captured = selected.optJSONArray("capturedPhases");
        if (required == null) throw new IOException("Voor deze fotoset zijn geen fotofasen opgegeven.");
        JSONArray order = new JSONArray(); for (String phase : PHOTO_PHASES) order.put(phase);
        for (int p = 0; p < order.length(); p++) {
            String phase = order.getString(p); boolean isRequired = false, isCaptured = false;
            for (int i = 0; i < required.length(); i++) if (phase.equals(required.optString(i))) isRequired = true;
            if (captured != null) for (int i = 0; i < captured.length(); i++) if (phase.equals(captured.optString(i))) isCaptured = true;
            JSONArray queue = pack.optJSONArray("pendingPhotoPhases");
            if (queue != null) for (int i = 0; i < queue.length(); i++) if (phase.equals(queue.optString(i))) isCaptured = true;
            if (queuedEntries != null) for (int i = 0; i < queuedEntries.length(); i++) {
                JSONObject entry = queuedEntries.optJSONObject(i), payload = entry == null ? null : entry.optJSONObject("payload");
                if (entry != null && "evidence".equals(entry.optString("kind"))
                    && pack.optJSONObject("job").optString("id").equals(entry.optString("jobId"))
                    && payload != null && setId.equals(payload.optString("setId")) && phase.equals(payload.optString("phase"))) isCaptured = true;
            }
            if (isRequired && !isCaptured) return phase;
        }
        return "";
    }
    void queuePhoto(JSONObject data, JSONObject pack, String setId, String phase, byte[] photo, String notes, long capturedAt) throws Exception {
        if (!jpeg(photo) || photo.length < 12 || photo.length > MAX_PHOTO) throw new IOException("Gebruik een echte JPEG-foto van maximaal 2 MB.");
        String next = nextPhotoPhase(pack, setId, data.optJSONArray("queue"));
        if (next.isEmpty()) throw new IOException("Alle verplichte fasen van deze fotoset zijn al vastgelegd.");
        if (!next.equals(phase)) throw new IOException("Leg eerst de fase '" + next + "' vast.");
        if (capturedAt <= 0 || capturedAt > System.currentTimeMillis() + 5 * 60 * 1000L) throw new IOException("De opnametijd van deze telefoon is ongeldig.");
        String note = notes == null ? "" : notes.trim(); if (note.length() > 1000) throw new IOException("De toelichting mag maximaal 1.000 tekens bevatten.");
        JSONArray queue = data.getJSONArray("queue"); if (queue.length() >= 100) throw new IOException("De offline wachtrij is vol.");
        long queuedBytes = 0; int queuedPhotos = 0;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject entry = queue.getJSONObject(i);
            if ("evidence".equals(entry.optString("kind")) && entry.optString("jobId").equals(pack.getJSONObject("job").optString("id"))) {
                queuedPhotos++; queuedBytes += entry.optJSONObject("payload").optLong("sizeBytes");
            }
        }
        if (queuedPhotos >= 20 || queuedBytes + photo.length > 8L * 1024 * 1024) throw new IOException("De offline fotowachtrij is vol; synchroniseer eerst bestaande foto's.");
        JSONObject updatedPack = new JSONObject(pack.toString());
        JSONObject photoSet = null; JSONArray sets = updatedPack.optJSONObject("checks").optJSONArray("photos");
        for (int i = 0; i < sets.length(); i++) if (setId.equals(sets.getJSONObject(i).optString("id"))) photoSet = sets.getJSONObject(i);
        if (photoSet == null) throw new IOException("Fotoset ontbreekt in de werkmap.");
        JSONArray pending = photoSet.optJSONArray("pendingPhotoPhases"); if (pending == null) pending = new JSONArray(); pending.put(phase); photoSet.put("pendingPhotoPhases", pending);
        String entryKey = UUID.randomUUID().toString();
        JSONObject payload = new JSONObject().put("setId", setId).put("phase", phase).put("entryKey", entryKey)
            .put("sourceHash", pack.getString("sourceHash")).put("capturedAt", java.time.format.DateTimeFormatter.ISO_INSTANT.format(java.time.Instant.ofEpochMilli(capturedAt)))
            .put("notes", note).put("filename", phase + "-" + entryKey + ".jpg").put("mimeType", "image/jpeg")
            .put("sizeBytes", photo.length).put("fileBase64", android.util.Base64.encodeToString(photo, android.util.Base64.NO_WRAP));
        queue.put(new JSONObject().put("jobId", pack.getJSONObject("job").getString("id")).put("kind", "evidence").put("payload", payload).put("state", "pending"));
        JSONArray packs = data.getJSONArray("packs");
        for (int i = 0; i < packs.length(); i++) if (packs.getJSONObject(i).getJSONObject("job").getString("id").equals(pack.getJSONObject("job").getString("id"))) packs.put(i, updatedPack);
    }
    void queueSiteReceipt(JSONObject data, JSONObject pack, String issueId, double received, double accepted, double damaged,
            String receiptReference, String evidenceReference, String location) throws Exception {
        JSONObject have = pack.optJSONObject("have");
        JSONArray issues = have == null ? null : have.optJSONArray("siteIssues"); JSONObject issue = null;
        for (int i = 0; issues != null && i < issues.length(); i++) {
            JSONObject candidate = issues.optJSONObject(i);
            if (candidate != null && issueId.equals(candidate.optString("id"))) issue = candidate;
        }
        if (issue == null || issue.optDouble("remainingQuantity", 0) <= 0) throw new IOException("Deze levering staat niet meer open in de opgeslagen werkmap.");
        if (!Double.isFinite(received) || !Double.isFinite(accepted) || !Double.isFinite(damaged)
                || received <= 0 || accepted < 0 || damaged < 0 || received > 1e9
                || Math.abs(received * 10000 - Math.rint(received * 10000)) > 0.00001
                || Math.abs(accepted * 10000 - Math.rint(accepted * 10000)) > 0.00001
                || Math.abs(damaged * 10000 - Math.rint(damaged * 10000)) > 0.00001
                || accepted + damaged > received + 0.0000001) {
            throw new IOException("Gebruik geldige hoeveelheden met maximaal vier decimalen; geaccepteerd plus beschadigd mag niet hoger zijn dan ontvangen.");
        }
        String reference = boundedText(receiptReference, "Ontvangstbon of referentie", 240);
        String evidence = boundedText(evidenceReference, "Bewijsreferentie", 240);
        String place = boundedText(location, "Ontvangstlocatie", 240);
        JSONArray queue = data.getJSONArray("queue"); if (queue.length() >= 100) throw new IOException("De wachtrij is vol.");
        String jobId = pack.getJSONObject("job").getString("id");
        double remaining = issue.optDouble("remainingQuantity", 0);
        for (int i = 0; i < queue.length(); i++) {
            JSONObject entry = queue.optJSONObject(i);
            if (entry == null || !"site_receipt".equals(entry.optString("kind")) || !jobId.equals(entry.optString("jobId"))
                    || !issueId.equals(entry.optString("issueId"))) continue;
            if ("conflict".equals(entry.optString("state"))) throw new IOException("Er is al een ontvangstconflict voor deze levering. Controleer dit eerst met kantoor.");
            remaining -= entry.optJSONObject("payload").optDouble("receivedQuantity", 0);
        }
        if (received > remaining + 0.0000001) throw new IOException("Er staat nog maar " + Math.max(0, remaining) + " " + issue.optString("unit") + " open in deze werkmap.");
        String sourceHash = pack.optString("sourceHash", "");
        if (!sourceHash.matches("[a-f0-9]{64}")) throw new IOException("De opgeslagen werkpakketversie is ongeldig. Werk de werkmap online bij.");
        String entryKey = UUID.randomUUID().toString();
        JSONObject payload = new JSONObject().put("entryKey", entryKey).put("sourceHash", sourceHash)
            .put("expectedDispatchReference", issue.optString("dispatchReference"))
            .put("expectedRemainingQuantity", remaining).put("receiptReference", reference)
            .put("receivedBy", "Uitvoerder").put("location", place).put("evidenceReference", evidence)
            .put("receivedQuantity", received).put("acceptedQuantity", accepted).put("damagedQuantity", damaged);
        queue.put(new JSONObject().put("jobId", jobId).put("kind", "site_receipt").put("issueId", issueId)
            .put("payload", payload).put("state", "pending"));
    }
    void queueSafetyBriefingAcknowledgement(JSONObject data, JSONObject pack, JSONObject meeting,
            String evidenceReference, long acknowledgedAt) throws Exception {
        if (data.optLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline werkmap verlopen; meld je online aan.");
        String meetingStatus = meeting.optString("status");
        if (!"scheduled".equals(meetingStatus) && !"in_progress".equals(meetingStatus)) throw new IOException("Deze briefing staat niet meer open voor erkenning.");
        String meetingId = boundedText(meeting.optString("id"), "Briefing", 200);
        String contentHash = meeting.optString("briefingContentHash", "");
        if (!contentHash.matches("[a-f0-9]{64}")) throw new IOException("De opgeslagen briefing heeft geen geldige revisie. Werk de werkmap online bij.");
        String evidence = boundedText(evidenceReference, "Erkenningsreferentie", 240);
        if (evidence.length() < 3) throw new IOException("Een korte bewijsreferentie is verplicht.");
        if (acknowledgedAt <= 0 || acknowledgedAt > System.currentTimeMillis() + 5 * 60 * 1000L) throw new IOException("De erkenningstijd op deze telefoon is ongeldig.");
        String scheduledAt = meeting.optString("scheduledAt", "");
        try {
            if (!scheduledAt.isEmpty() && acknowledgedAt < java.time.Instant.parse(scheduledAt).toEpochMilli() - 30 * 60 * 1000L) {
                throw new IOException("Erkenning kan pas kort voor de geplande briefing worden vastgelegd.");
            }
        } catch (java.time.format.DateTimeParseException error) { throw new IOException("De geplande briefingtijd is ongeldig."); }
        JSONArray attendees = meeting.optJSONArray("attendeeRecords"); JSONObject own = null;
        String scope = data.optString("scope", ""), marker = ":field_worker:";
        int workerMarker = scope.lastIndexOf(marker);
        String workerId = workerMarker < 0 ? "" : scope.substring(workerMarker + marker.length());
        for (int i = 0; attendees != null && i < attendees.length(); i++) {
            JSONObject attendee = attendees.optJSONObject(i);
            if (attendee != null && workerId.equals(attendee.optString("workerId"))) own = attendee;
        }
        if (own == null || !"expected".equals(own.optString("status"))) throw new IOException("Deze briefing is niet aan jouw uitvoerdersaccount toegewezen of is al afgehandeld.");
        JSONArray queue = data.getJSONArray("queue"); if (queue.length() >= 100) throw new IOException("De offline wachtrij is vol.");
        for (int i = 0; i < queue.length(); i++) {
            JSONObject entry = queue.optJSONObject(i);
            if (entry != null && "safety_briefing_acknowledgement".equals(entry.optString("kind"))
                    && meetingId.equals(entry.optString("meetingId"))) throw new IOException("Er staat al een lokale erkenning voor deze briefing in de wachtrij.");
        }
        String entryKey = UUID.randomUUID().toString();
        JSONObject payload = new JSONObject().put("entryKey", entryKey).put("briefingContentHash", contentHash)
            .put("acknowledged", true).put("acknowledgedAt", java.time.format.DateTimeFormatter.ISO_INSTANT.format(java.time.Instant.ofEpochMilli(acknowledgedAt)))
            .put("evidenceReference", evidence)
            .put("attestation", "I attended this briefing, understood the retained topics, and will stop work if conditions or controls change.");
        queue.put(new JSONObject().put("jobId", pack.getJSONObject("job").getString("id")).put("kind", "safety_briefing_acknowledgement")
            .put("meetingId", meetingId).put("payload", payload).put("state", "pending"));
        meeting.put("pendingLocalAcknowledgement", new JSONObject().put("entryKey", entryKey).put("state", "pending"));
    }
    private static String boundedText(String value, String label, int max) throws IOException {
        String result = value == null ? "" : value.trim();
        if (result.length() < 3 || result.length() > max) throw new IOException(label + " moet 3-240 tekens bevatten.");
        for (int i = 0; i < result.length(); i++) if (Character.isISOControl(result.charAt(i)) && result.charAt(i) != '\t') throw new IOException(label + " bevat ongeldige tekens.");
        return result;
    }
    static byte[] bounded(InputStream stream, int max) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] chunk = new byte[8192]; int read;
        while ((read = stream.read(chunk)) != -1) { if (output.size() + read > max) throw new IOException("Bestand overschrijdt de toegestane grootte."); output.write(chunk, 0, read); }
        return output.toByteArray();
    }
    static String sha(byte[] bytes) throws Exception { StringBuilder result = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x", b & 255)); return result.toString(); }
    static String encode(String value) throws Exception { return URLEncoder.encode(value, "UTF-8").replace("+", "%20"); }
    static String scope(JSONObject operator) throws Exception {
        if (!operator.optBoolean("authenticated") || !"field_worker".equals(operator.optString("role"))) throw new IOException("Een persoonlijk uitvoerdersaccount is vereist.");
        JSONObject worker = operator.optJSONObject("worker");
        String company = operator.optString("companyId", ""), ledger = operator.optString("ledgerId", "");
        String workerId = worker == null ? "" : worker.optString("id", "");
        if (!company.matches("[a-z0-9][a-z0-9_-]{2,63}")
            || !ledger.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
            || workerId.isEmpty()) throw new IOException("Bedrijf, ledger of uitvoerder ontbreekt in het account.");
        return "company:" + company + ":ledger:" + ledger + ":field_worker:" + workerId;
    }
    private SecretKey key() throws Exception {
        if (!((KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceSecure()) throw new IOException("Stel eerst een schermvergrendeling in op deze telefoon.");
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        String alias = "contractor-field-vault-v1";
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256);
            if (Build.VERSION.SDK_INT >= 28) builder.setUnlockedDeviceRequired(true);
            generator.init(builder.build()); generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }
    JSONObject load() throws Exception {
        if (!vault.getBaseFile().exists()) return null;
        byte[] stored; try (InputStream input = vault.openRead()) { stored = bounded(input, MAX_VAULT + 128); }
        if (stored.length < 28) throw new IOException("Lokale werkmap is beschadigd.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, stored, 0, 12));
        return new JSONObject(new String(cipher.doFinal(stored, 12, stored.length - 12), StandardCharsets.UTF_8));
    }
    void save(JSONObject data) throws Exception {
        byte[] bytes = data.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_VAULT) throw new IOException("De versleutelde werkmap is vol (24 MB).");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        FileOutputStream output = null;
        try { output = vault.startWrite(); output.write(cipher.getIV()); output.write(cipher.doFinal(bytes)); vault.finishWrite(output); }
        catch (Exception error) { if (output != null) vault.failWrite(output); throw error; }
    }
    void erase() { vault.delete(); token = ""; companyId = ""; ledgerId = ""; }
    JSONObject download(String jobId) throws Exception {
        String path = "/api/ledger/jobs/" + encode(jobId) + "/work-pack";
        JSONObject pack = json(path, null).getJSONObject("pack"); JSONArray drawings = pack.getJSONObject("know").getJSONArray("drawings"), files = new JSONArray();
        if (drawings.length() > 50) throw new IOException("Maximaal 50 tekeningen per werkpakket.");
        int total = 0;
        for (int i = 0; i < drawings.length(); i++) {
            JSONObject drawing = drawings.getJSONObject(i), metadata = drawing.getJSONObject("file");
            int size = metadata.getInt("sizeBytes"); total += size;
            if (size < 1 || size > 8 * 1024 * 1024 || total > 12 * 1024 * 1024) throw new IOException("Offline limiet: 8 MB per PDF, 12 MB per pakket.");
            byte[] bytes = request(path + "/drawings/" + encode(drawing.getString("id")) + "/content?sourceHash=" + pack.getString("sourceHash"), null, size, "application/pdf");
            if (bytes.length != size || !sha(bytes).equals(metadata.getString("sha256")) || !new String(bytes, 0, Math.min(5, bytes.length), StandardCharsets.US_ASCII).equals("%PDF-")) throw new IOException("Tekening wijkt af van de goedgekeurde bron.");
            files.put(new JSONObject(metadata.toString()).put("drawingId", drawing.getString("id")).put("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)));
        }
        if (!json(path, null).getJSONObject("pack").getString("sourceHash").equals(pack.getString("sourceHash"))) throw new IOException("Werkpakket gewijzigd tijdens downloaden.");
        return pack.put("offlineFiles", files).put("savedAt", System.currentTimeMillis());
    }
    static final class ApiError extends IOException {
        final int status;
        ApiError(int status) { super(status == 409 ? "Bron gewijzigd; lees de nieuwe werkpakketversie." : "Serververzoek mislukt (" + status + ")."); this.status = status; }
    }
}
