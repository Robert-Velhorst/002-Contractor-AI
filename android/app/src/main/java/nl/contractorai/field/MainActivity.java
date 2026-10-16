package nl.contractorai.field;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import android.content.pm.PackageManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.ArrayList;
import java.util.Calendar;
import java.text.DateFormat;
import java.util.Date;
import java.util.List;
import java.util.Iterator;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import androidx.core.content.FileProvider;

public final class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 4101;
    private static final int LOCAL_NETWORK_PERMISSION_REQUEST = 4102;
    private FieldStore store;
    private JSONObject data;
    private String currentScope = "", selectedJob = "", message = "";
    private String pendingLocalNetworkOrigin = "";
    private LinearLayout content;
    private boolean busy;
    private boolean activityVisible, packVisible, replyPollBusy, replyPollingStopped;
    private TextView replyStatusView;
    private final android.os.Handler expiryHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final android.os.Handler replyHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable checkExpiry = new Runnable() {
        @Override public void run() {
            if (isDestroyed()) return;
            if (!busy && data != null && data.optLong("expiresAt") <= System.currentTimeMillis()) {
                closePdf(); showJobs(); return;
            }
            expiryHandler.postDelayed(this, 1000);
        }
    };
    private final Runnable refreshReplies = new Runnable() {
        @Override public void run() { refreshReplyFeed(); }
    };
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private PdfRenderer pdf;
    private ParcelFileDescriptor pdfDescriptor;
    private File pdfFile;
    private Bitmap bitmap;
    private int pdfPage;
    private float pdfScale = 1;
    private File pendingPhotoFile;
    private String pendingPhotoJobId = "", pendingPhotoSetId = "", pendingPhotoNotes = "";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        store = new FieldStore(this);
        if (state != null) {
            pendingLocalNetworkOrigin = state.getString("pendingLocalNetworkOrigin", "");
            String filePath = state.getString("pendingPhotoFile", "");
            if (!filePath.isEmpty()) pendingPhotoFile = new File(filePath);
            pendingPhotoJobId = state.getString("pendingPhotoJobId", ""); pendingPhotoSetId = state.getString("pendingPhotoSetId", "");
            pendingPhotoNotes = state.getString("pendingPhotoNotes", "");
        }
        clearStaleCameraFiles();
        showLogin();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (!pendingLocalNetworkOrigin.isEmpty()) state.putString("pendingLocalNetworkOrigin", pendingLocalNetworkOrigin);
        if (pendingPhotoFile != null) state.putString("pendingPhotoFile", pendingPhotoFile.getAbsolutePath());
        state.putString("pendingPhotoJobId", pendingPhotoJobId); state.putString("pendingPhotoSetId", pendingPhotoSetId);
        state.putString("pendingPhotoNotes", pendingPhotoNotes);
    }
    private void page(String title) {
        packVisible = false; replyStatusView = null; replyHandler.removeCallbacks(refreshReplies);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(24, 48, 24, 32);
        content.setBackgroundColor(Color.WHITE); scroll.addView(content); setContentView(scroll);
        text("Contractor.AI", 26); text(title, 21);
        if (!message.isEmpty()) text(message, 16).setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    }
    private TextView text(String value, int size) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(Color.rgb(24, 51, 48)); view.setPadding(0, 8, 0, 10); content.addView(view); return view;
    }
    private EditText input(String label, boolean secret) {
        TextView caption = text(label, 16); EditText field = new EditText(this); field.setId(View.generateViewId()); caption.setLabelFor(field.getId());
        field.setSingleLine(secret); field.setMinHeight(56);
        field.setInputType(secret ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); content.addView(field); return field;
    }
    private void button(String label, Runnable action) {
        Button button = new Button(this); button.setText(label); button.setAllCaps(false); button.setMinHeight(52); button.setEnabled(!busy);
        button.setOnClickListener(v -> { if (!busy) action.run(); }); content.addView(button);
    }
    private void enable(View view, boolean enabled) {
        view.setEnabled(enabled);
        if (view instanceof android.view.ViewGroup) { android.view.ViewGroup group = (android.view.ViewGroup) view; for (int i=0;i<group.getChildCount();i++) enable(group.getChildAt(i), enabled); }
    }
    private interface Work { void run() throws Exception; }
    private void work(Work operation, Runnable success) {
        if (busy) return; busy = true; enable(content, false);
        executor.execute(() -> {
            try { operation.run(); runOnUiThread(() -> { if (isDestroyed()) return; busy = false; message = ""; success.run(); }); }
            catch (Exception error) { runOnUiThread(() -> { if (isDestroyed()) return; busy = false; enable(content, true); message = error.getMessage() == null ? "Bewerking mislukt." : error.getMessage(); new AlertDialog.Builder(this).setTitle("Niet voltooid").setMessage(message).setPositiveButton("Sluiten", null).show(); }); }
        });
    }
    private void showLogin() {
        closePdf(); page("Uitvoering");
        EditText server = input("Serveradres (HTTPS)", false); server.setSingleLine(true); server.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); server.setText(store.origin);
        EditText key = input("Persoonlijke uitvoerderssleutel", true);
        button("Aanmelden", () -> {
            beginLogin(server.getText().toString(), key);
        });
        button("Offline werkmap openen", () -> work(() -> {
            JSONObject retained = store.load();
            if (retained == null) throw new IOException("Nog geen werkpakket op deze telefoon opgeslagen.");
            if (retained.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline toegang verlopen. Meld je online aan met het oorspronkelijke account om reacties te herstellen.");
            data = retained; store.origin = retained.getString("origin"); store.companyId = retained.optString("companyId");
            store.ledgerId = retained.optString("ledgerId"); store.token = ""; currentScope = "";
        }, this::showJobs));
        button("Lokale gegevens verwijderen", this::confirmErase);
    }
    private void beginLogin(String serverInput, EditText key) {
        final String origin;
        try { origin = FieldStore.origin(serverInput); }
        catch (Exception error) { message = error.getMessage() == null ? "Ongeldig serveradres." : error.getMessage(); showLogin(); return; }
        if (Build.VERSION.SDK_INT < 37 || checkSelfPermission(Manifest.permission.ACCESS_LOCAL_NETWORK) == PackageManager.PERMISSION_GRANTED) {
            performLogin(origin, key.getText().toString(), key); return;
        }
        if (busy) return;
        busy = true; enable(content, false);
        String host = Uri.parse(origin).getHost();
        executor.execute(() -> {
            boolean local;
            try { local = FieldStore.requiresLocalNetworkPermission(host); }
            catch (Exception ignored) { local = false; }
            final boolean requiresPermission = local;
            runOnUiThread(() -> {
                if (isDestroyed()) return;
                busy = false; enable(content, true);
                if (!requiresPermission) { performLogin(origin, key.getText().toString(), key); return; }
                key.setText("");
                store.origin = origin;
                new AlertDialog.Builder(this).setTitle("Lokale netwerktoegang")
                    .setMessage("Deze server staat op een lokaal netwerk. Android vraagt toestemming voordat de app daar verbinding mee maakt. Je uitvoerderssleutel wordt pas na die keuze gebruikt.")
                    .setNegativeButton("Annuleren", (dialog, which) -> { message = "Lokale netwerktoegang is niet verleend."; showLogin(); })
                    .setPositiveButton("Doorgaan", (dialog, which) -> {
                        pendingLocalNetworkOrigin = origin;
                        requestPermissions(new String[]{Manifest.permission.ACCESS_LOCAL_NETWORK}, LOCAL_NETWORK_PERMISSION_REQUEST);
                    }).show();
            });
        });
    }
    private void performLogin(String origin, String secret, EditText key) {
        key.setText("");
        work(() -> {
            store.origin = origin; store.token = secret;
            try {
                JSONObject operator = store.json("/api/session", null).getJSONObject("operator");
                currentScope = FieldStore.scope(operator);
                store.companyId = operator.getString("companyId");
                store.ledgerId = operator.getString("ledgerId");
            }
            catch (Exception error) { store.token = ""; throw error; }
            JSONObject retained = store.load();
            if (retained != null && (!retained.getString("origin").equals(store.origin) || !retained.getString("scope").equals(currentScope)
                || !retained.optString("companyId").equals(store.companyId) || !retained.optString("ledgerId").equals(store.ledgerId))) {
                store.token = ""; throw new IOException("Deze werkmap hoort bij een ander account of een andere server. Verwijder deze alleen na herstel van de wachtrij.");
            }
            data = retained != null ? retained : new JSONObject().put("origin", store.origin).put("scope", currentScope)
                .put("companyId", store.companyId).put("ledgerId", store.ledgerId)
                .put("expiresAt", System.currentTimeMillis() + FieldStore.TTL).put("packs", new JSONArray()).put("queue", new JSONArray());
        }, this::showJobs);
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCAL_NETWORK_PERMISSION_REQUEST) return;
        String origin = pendingLocalNetworkOrigin; pendingLocalNetworkOrigin = "";
        store.origin = origin;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            message = "Toestemming verleend. Voer je uitvoerderssleutel opnieuw in om aan te melden.";
        } else {
            message = "Lokale netwerktoegang is niet verleend. Geef de app toestemming in Android-instellingen om deze server te gebruiken.";
        }
        showLogin();
    }
    private void showJobs() {
        expiryHandler.removeCallbacks(checkExpiry);
        closePdf(); page("Werkpakketten");
        if (data.optLong("expiresAt") <= System.currentTimeMillis()) {
            text("Offline toegang verlopen. Alleen herstel van niet-verzonden reacties is nog beschikbaar.", 16);
            button("Wachtrij herstellen", this::showQueue);
            button("Afmelden", () -> { store.token=""; data=null; showLogin(); });
            return;
        }
        expiryHandler.postDelayed(checkExpiry, 1000);
        text("Opgeslagen kopie. Geen veiligheidsvrijgave. Offline wijzigingen op kantoor zijn niet zichtbaar.", 15);
        text("Beschikbaar tot " + DateFormat.getDateTimeInstance().format(new Date(data.optLong("expiresAt"))), 15);
        JSONArray packs = data.optJSONArray("packs");
        for (int i=0;i<packs.length();i++) { JSONObject pack = packs.optJSONObject(i); button(pack.optJSONObject("job").optString("title"), () -> { selectedJob = pack.optJSONObject("job").optString("id"); showPack(); }); }
        if (packs.length() == 0) text("Nog geen werkpakketten opgeslagen.", 16);
        if (!store.token.isEmpty()) {
            button("Toegewezen opdrachten ophalen", () -> fetchJobs("", false));
        }
        if (!data.optString("scope").isEmpty()) button(store.token.isEmpty()
            ? "Verhindering offline melden" : "Beschikbaarheid melden", this::showAvailability);
        else if (store.token.isEmpty()) button("Online aanmelden om beschikbaarheid te melden", this::showLogin);
        button("Wachtrij (" + data.optJSONArray("queue").length() + ")", this::showQueue);
        button("Afmelden en vergrendelen", () -> { store.token = ""; data = null; currentScope = ""; showLogin(); });
    }
    private void showAvailability() {
        if (data == null || data.optString("scope").isEmpty()) { showLogin(); return; }
        JSONArray priorResults = data.optJSONArray("availabilitySyncResults");
        if (priorResults != null && priorResults.length() > 0) { showAvailabilityResults(priorResults); return; }
        page("Beschikbaarheid melden");
        text("Meld alleen je periode. Een persoonlijke reden is niet nodig. Een standby-periode is geen toezegging en wijzigt geen bestaande opdracht.", 15);
        RadioGroup modeGroup = new RadioGroup(this); modeGroup.setOrientation(LinearLayout.VERTICAL);
        RadioButton unavailableMode = new RadioButton(this); unavailableMode.setText("Niet beschikbaar"); unavailableMode.setId(View.generateViewId());
        RadioButton standbyMode = new RadioButton(this); standbyMode.setText("Standby op afroep"); standbyMode.setId(View.generateViewId());
        modeGroup.addView(unavailableMode); modeGroup.addView(standbyMode); unavailableMode.setChecked(true); content.addView(modeGroup);
        int[] noticeChoices = {0, 2, 4, 8, 12, 24, 48};
        int[] minimumNoticeHours = {0};
        LinearLayout noticeGroup = new LinearLayout(this); noticeGroup.setOrientation(LinearLayout.VERTICAL); noticeGroup.setVisibility(View.GONE);
        TextView noticeValue = new TextView(this); noticeValue.setText("Geen minimum"); noticeValue.setTextSize(16); noticeGroup.addView(noticeValue);
        Button chooseNotice = new Button(this); chooseNotice.setText("Minimale aankondigingstijd kiezen"); chooseNotice.setAllCaps(false); chooseNotice.setMinHeight(52);
        chooseNotice.setOnClickListener(v -> {
            String[] labels = {"Geen minimum", "2 uur", "4 uur", "8 uur", "12 uur", "24 uur", "48 uur"};
            int selected = java.util.Arrays.binarySearch(noticeChoices, minimumNoticeHours[0]);
            new AlertDialog.Builder(this).setTitle("Minimale aankondigingstijd")
                .setSingleChoiceItems(labels, selected < 0 ? 0 : selected, (dialog, which) -> {
                    minimumNoticeHours[0] = noticeChoices[which]; noticeValue.setText(labels[which]); dialog.dismiss();
                }).setNegativeButton("Annuleren", null).show();
        });
        noticeGroup.addView(chooseNotice); content.addView(noticeGroup);
        Calendar startsAt = Calendar.getInstance(); startsAt.set(Calendar.SECOND, 0); startsAt.set(Calendar.MILLISECOND, 0);
        Calendar endsAt = (Calendar) startsAt.clone(); endsAt.add(Calendar.HOUR_OF_DAY, 8);
        Calendar reviewAt = (Calendar) startsAt.clone(); reviewAt.add(Calendar.DAY_OF_MONTH, 1);
        LinearLayout reviewGroup = new LinearLayout(this); reviewGroup.setOrientation(LinearLayout.VERTICAL); reviewGroup.setVisibility(View.GONE);
        TextView reviewValue = new TextView(this); reviewValue.setText(DateFormat.getDateInstance().format(reviewAt.getTime())); reviewValue.setTextSize(16); reviewGroup.addView(reviewValue);
        Button chooseReview = new Button(this); chooseReview.setText("Herbeoordeling kiezen"); chooseReview.setAllCaps(false); chooseReview.setMinHeight(52);
        chooseReview.setOnClickListener(v -> {
            Calendar earliestReview = (Calendar) startsAt.clone(); earliestReview.add(Calendar.DAY_OF_MONTH, 1);
            earliestReview.set(Calendar.HOUR_OF_DAY, 0); earliestReview.set(Calendar.MINUTE, 0);
            earliestReview.set(Calendar.SECOND, 0); earliestReview.set(Calendar.MILLISECOND, 0);
            chooseDate(reviewAt, reviewValue, earliestReview);
        });
        reviewGroup.addView(chooseReview); content.addView(reviewGroup);
        TextView startValue = text(DateFormat.getDateTimeInstance().format(startsAt.getTime()), 16);
        button("Vanaf kiezen", () -> chooseDateTime(startsAt, startValue, () -> {
            reviewAt.setTimeInMillis(startsAt.getTimeInMillis()); reviewAt.add(Calendar.DAY_OF_MONTH, 1);
            reviewValue.setText(DateFormat.getDateInstance().format(reviewAt.getTime()));
        }));
        CheckBox unknownReturn = new CheckBox(this); unknownReturn.setText("Ik weet nog niet wanneer ik terug ben"); content.addView(unknownReturn);
        LinearLayout endGroup = new LinearLayout(this); endGroup.setOrientation(LinearLayout.VERTICAL);
        TextView endValue = new TextView(this); endValue.setText(DateFormat.getDateTimeInstance().format(endsAt.getTime())); endValue.setTextSize(16); endGroup.addView(endValue);
        Button chooseEnd = new Button(this); chooseEnd.setText("Tot kiezen"); chooseEnd.setAllCaps(false); chooseEnd.setMinHeight(52);
        chooseEnd.setOnClickListener(v -> chooseDateTime(endsAt, endValue)); endGroup.addView(chooseEnd); content.addView(endGroup);
        unknownReturn.setOnCheckedChangeListener((button, checked) -> {
            endGroup.setVisibility(checked ? View.GONE : View.VISIBLE);
            reviewGroup.setVisibility(checked ? View.VISIBLE : View.GONE);
        });
        modeGroup.setOnCheckedChangeListener((group, checkedId) -> {
            boolean standby = checkedId == standbyMode.getId();
            noticeGroup.setVisibility(standby ? View.VISIBLE : View.GONE);
            unknownReturn.setVisibility(standby ? View.GONE : View.VISIBLE);
            if (standby && unknownReturn.isChecked()) unknownReturn.setChecked(false);
        });
        button("Verhindering melden", () -> {
            boolean returnUnknown = unknownReturn.isChecked();
            String startsAtIso = java.time.format.DateTimeFormatter.ISO_INSTANT.format(startsAt.toInstant());
            String endsAtIso = java.time.format.DateTimeFormatter.ISO_INSTANT.format(endsAt.toInstant());
            String reviewDate = java.time.LocalDate.of(reviewAt.get(Calendar.YEAR), reviewAt.get(Calendar.MONTH) + 1,
                reviewAt.get(Calendar.DAY_OF_MONTH)).toString();
            if (!returnUnknown && endsAt.getTimeInMillis() <= startsAt.getTimeInMillis()) {
                new AlertDialog.Builder(this).setTitle("Controleer de periode")
                    .setMessage("De eindtijd moet na de starttijd liggen. Pas een van de tijden aan.")
                    .setPositiveButton("Verder aanpassen", null).show();
                return;
            }
            if (returnUnknown && reviewAt.getTimeInMillis() <= startsAt.getTimeInMillis()) {
                new AlertDialog.Builder(this).setTitle("Controleer de herbeoordeling")
                    .setMessage("Kies een herbeoordelingsdatum na de startdatum.")
                    .setPositiveButton("Verder aanpassen", null).show();
                return;
            }
            queueAvailability(startsAtIso, endsAtIso, returnUnknown, reviewDate,
                standbyMode.isChecked(), minimumNoticeHours[0]);
        });
        button("Annuleren", this::showJobs);
    }
    private void queueAvailability(String startsAt, String endsAt, boolean returnUnknown, String reviewAt,
                                   boolean standby, int minimumNoticeHours) {
        work(() -> {
            if (data.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("De offline werkmap is verlopen. Meld je online aan om deze melding te synchroniseren.");
            JSONObject updated = new JSONObject(data.toString()); JSONArray queue = updated.getJSONArray("queue");
            if (queue.length() >= 100) throw new IOException("De wachtrij is vol; synchroniseer eerst bestaande reacties.");
            int waitingReports = 0;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject existing = queue.optJSONObject(i); if (existing == null || !"availability".equals(existing.optString("kind"))) continue;
                waitingReports++;
                JSONObject pending = existing.optJSONObject("payload");
                if (pending != null && startsAt.equals(pending.optString("startsAt"))
                    && standby == "standby".equals(pending.optString("mode"))
                    && (!standby || minimumNoticeHours == pending.optInt("minimumNoticeHours", 0))
                    && returnUnknown == pending.optBoolean("returnUnknown")
                    && (returnUnknown ? reviewAt.equals(pending.optString("reviewAt")) : endsAt.equals(pending.optString("endsAt")))) {
                    throw new IOException("Deze beschikbaarheidsmelding staat al in de wachtrij.");
                }
            }
            if (waitingReports >= 10) throw new IOException("Er kunnen maximaal 10 verhindermeldingen tegelijk wachten. Synchroniseer ze eerst met kantoor.");
            String entryKey = UUID.randomUUID().toString();
            JSONObject payload = new JSONObject().put("entryKey", entryKey).put("mode", standby ? "standby" : "unavailable")
                .put("startsAt", startsAt).put("returnUnknown", returnUnknown);
            if (standby) payload.put("minimumNoticeHours", minimumNoticeHours);
            if (returnUnknown) payload.put("reviewAt", reviewAt); else payload.put("endsAt", endsAt);
            queue.put(new JSONObject().put("kind", "availability").put("payload", payload).put("state", "pending"));
            store.save(updated); data = updated;
        }, () -> {
            message = "Versleuteld op deze telefoon bewaard; nog niet door kantoor ontvangen.";
            showQueue();
            if (!store.token.isEmpty()) sync();
        });
    }
    private void showAvailabilityResults(JSONArray responses) {
        page("Meldingen ontvangen");
        text("Deze beschikbaarheidsmeldingen zijn door de server ontvangen. Eventuele planningsconflicten vragen aandacht van de aannemer.", 16);
        for (int i = 0; i < responses.length(); i++) {
            JSONObject response = responses.optJSONObject(i);
            if (response == null) continue;
            text("Melding " + (i + 1), 18);
            renderAvailabilityResult(response);
        }
        button("Resultaten sluiten", this::clearAvailabilityResults);
    }
    private void clearAvailabilityResults() {
        work(() -> {
            JSONObject updated = new JSONObject(data.toString()); updated.remove("availabilitySyncResults");
            store.save(updated); data = updated;
        }, this::showQueue);
    }
    private void renderAvailabilityResult(JSONObject response) {
        JSONObject period = response.optJSONObject("period");
        text("Je beschikbaarheid is vastgelegd. Eventuele planningsconflicten vragen aandacht van de aannemer; bestaande opdrachten zijn niet gewijzigd.", 16);
        int invalidatedCalloutCount = response.optInt("invalidatedCalloutCount",
            response.optJSONArray("invalidatedCallouts") == null ? 0 : response.optJSONArray("invalidatedCallouts").length());
        if (invalidatedCalloutCount > 0) text(invalidatedCalloutCount
            + " open standby-oproep" + (invalidatedCalloutCount == 1 ? " is" : "en zijn")
            + " ingetrokken; kantoor moet de bezetting opnieuw beoordelen.", 16);
        if (period != null) text("Vanaf " + displayDateTime(period.optString("startsAt"))
            + (period.optBoolean("returnUnknown") ? " · terugkeer nog onbekend" : " tot " + displayDateTime(period.optString("endsAt"))), 15);
        JSONArray conflicts = response.optJSONArray("conflicts");
        int conflictCount = response.optInt("conflictCount", conflicts == null ? 0 : conflicts.length());
        if (conflictCount == 0) text("Er zijn geen bestaande opdrachten gevonden die deze periode overlappen.", 15);
        else {
            text("Opdrachten die aandacht vragen (" + conflictCount + ")", 18);
            for (int i = 0; conflicts != null && i < conflicts.length(); i++) {
                JSONObject conflict = conflicts.optJSONObject(i);
                if (conflict == null) continue;
                text(conflict.optString("jobTitle", "Opdracht") + " · " + displayDateTime(conflict.optString("scheduledStart"))
                    + " tot " + displayDateTime(conflict.optString("scheduledEnd")), 15);
            }
            if (response.optBoolean("conflictsTruncated")) text("De server vond meer conflicten; alleen de eerste 50 zijn op deze telefoon bewaard. Bekijk het volledige overzicht met kantoor.", 14);
        }
    }
    private JSONObject availabilityReceipt(JSONObject response) throws Exception {
        JSONObject sourcePeriod = response.optJSONObject("period"), period = new JSONObject();
        if (sourcePeriod != null) {
            period.put("startsAt", sourcePeriod.optString("startsAt"));
            period.put("endsAt", sourcePeriod.optString("endsAt"));
            period.put("returnUnknown", sourcePeriod.optBoolean("returnUnknown"));
            period.put("reviewAt", sourcePeriod.optString("followUpAt"));
        }
        JSONArray sourceConflicts = response.optJSONArray("conflicts"), conflicts = new JSONArray();
        int count = sourceConflicts == null ? 0 : sourceConflicts.length();
        for (int i = 0; sourceConflicts != null && i < Math.min(count, 50); i++) {
            JSONObject item = sourceConflicts.optJSONObject(i); if (item == null) continue;
            String title = item.optString("jobTitle", "Opdracht");
            if (title.length() > 200) title = title.substring(0, 200);
            conflicts.put(new JSONObject().put("jobTitle", title).put("scheduledStart", item.optString("scheduledStart"))
                .put("scheduledEnd", item.optString("scheduledEnd")));
        }
        JSONArray invalidatedCallouts = response.optJSONArray("invalidatedCallouts");
        return new JSONObject().put("period", period).put("conflicts", conflicts)
            .put("conflictCount", count).put("conflictsTruncated", count > conflicts.length())
            .put("invalidatedCalloutCount", invalidatedCallouts == null ? 0 : invalidatedCallouts.length());
    }
    private void chooseDateTime(Calendar value, TextView output) { chooseDateTime(value, output, null); }
    private void chooseDateTime(Calendar value, TextView output, Runnable afterSelection) {
        new android.app.DatePickerDialog(this, (picker, year, month, day) -> {
            value.set(year, month, day);
            new android.app.TimePickerDialog(this, (pickerTime, hour, minute) -> {
                value.set(Calendar.HOUR_OF_DAY, hour); value.set(Calendar.MINUTE, minute);
                value.set(Calendar.SECOND, 0); value.set(Calendar.MILLISECOND, 0);
                output.setText(DateFormat.getDateTimeInstance().format(value.getTime()));
                if (afterSelection != null) afterSelection.run();
            }, value.get(Calendar.HOUR_OF_DAY), value.get(Calendar.MINUTE), true).show();
        }, value.get(Calendar.YEAR), value.get(Calendar.MONTH), value.get(Calendar.DAY_OF_MONTH)).show();
    }
    private void chooseDate(Calendar value, TextView output) {
        chooseDate(value, output, null);
    }
    private void chooseDate(Calendar value, TextView output, Calendar minimumDate) {
        android.app.DatePickerDialog dialog = new android.app.DatePickerDialog(this, (picker, year, month, day) -> {
            value.set(year, month, day); output.setText(DateFormat.getDateInstance().format(value.getTime()));
        }, value.get(Calendar.YEAR), value.get(Calendar.MONTH), value.get(Calendar.DAY_OF_MONTH));
        if (minimumDate != null) dialog.getDatePicker().setMinDate(minimumDate.getTimeInMillis());
        dialog.show();
    }
    private String displayDateTime(String value) {
        try { return DateFormat.getDateTimeInstance().format(new Date(java.time.Instant.parse(value).toEpochMilli())); }
        catch (Exception ignored) { return value; }
    }
    private void fetchJobs(String cursor, boolean append) {
        final JSONObject[] result = new JSONObject[1];
        work(() -> { result[0] = store.json("/api/ledger/work-packs?limit=20" + (cursor.isEmpty() ? "" : "&after=" + FieldStore.encode(cursor)), null); }, () -> {
            if (!append) page("Toegewezen opdrachten");
            JSONArray rows = result[0].optJSONArray("rows");
            for (int i=0;i<rows.length();i++) { JSONObject row = rows.optJSONObject(i); button("Download: " + row.optString("title"), () -> download(row.optString("id"))); }
            String next = result[0].optString("nextCursor", ""); if (!next.isEmpty() && !"null".equals(next)) button("Volgende opdrachten", () -> fetchJobs(next, false));
            button("Terug naar werkmap", this::showJobs);
        });
    }
    private void download(String jobId) {
        work(() -> {
            if (data.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Herstel eerst de verlopen wachtrij en verwijder daarna de oude werkmap.");
            String identity = FieldStore.scope(store.json("/api/session", null).getJSONObject("operator"));
            if (!identity.equals(data.getString("scope"))) throw new IOException("Uitvoerdersaccount gewijzigd.");
            JSONObject updated = new JSONObject(data.toString()); JSONArray packs = updated.getJSONArray("packs");
            JSONObject pack = store.download(jobId); int index = -1;
            JSONObject briefings = store.json("/api/ledger/safety-briefings?jobId=" + FieldStore.encode(jobId) + "&limit=100", null);
            pack.put("safetyMeetings", briefings.optJSONArray("safetyMeetings") == null ? new JSONArray() : briefings.optJSONArray("safetyMeetings"));
            for (int i=0;i<packs.length();i++) if (packs.getJSONObject(i).getJSONObject("job").getString("id").equals(jobId)) index=i;
            if (index < 0 && packs.length() >= 20) throw new IOException("Maximaal 20 werkpakketten per telefoon.");
            if (index < 0) packs.put(pack); else packs.put(index, pack);
            store.save(updated); data = updated; selectedJob = jobId;
        }, this::showPack);
    }
    private JSONObject pack() { JSONArray packs = data.optJSONArray("packs"); for (int i=0;i<packs.length();i++) { JSONObject row=packs.optJSONObject(i); if (row.optJSONObject("job").optString("id").equals(selectedJob)) return row; } return null; }
    private void scheduleReplyRefresh() {
        replyHandler.removeCallbacks(refreshReplies);
        if (activityVisible && packVisible && !store.token.isEmpty() && !replyPollingStopped)
            replyHandler.postDelayed(refreshReplies, 30_000L);
    }
    private boolean networkAvailable() {
        ConnectivityManager manager = getSystemService(ConnectivityManager.class);
        Network network = manager == null ? null : manager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
    private void refreshReplyFeed() {
        if (!activityVisible || !packVisible || data == null || store.token.isEmpty() || replyPollingStopped
            || !networkAvailable() || busy || replyPollBusy || selectedJob.isEmpty()) {
            if (!replyPollingStopped) scheduleReplyRefresh(); return;
        }
        final String jobId = selectedJob;
        replyPollBusy = true;
        executor.execute(() -> {
            JSONObject response = null; Exception failure = null;
            try { response = store.json("/api/ledger/jobs/" + FieldStore.encode(jobId) + "/work-pack/replies", null); }
            catch (Exception error) { failure = error; }
            final JSONObject replyResponse = response;
            final Exception replyFailure = failure;
            runOnUiThread(() -> {
                replyPollBusy = false;
                if (!activityVisible || !packVisible || !jobId.equals(selectedJob) || data == null) return;
                if (replyFailure instanceof FieldStore.ApiError && (((FieldStore.ApiError) replyFailure).status == 401
                    || ((FieldStore.ApiError) replyFailure).status == 403)) {
                    replyPollingStopped = true;
                    if (replyStatusView != null) {
                        replyStatusView.setText("Geen actuele toegang tot kantoorantwoorden. Meld opnieuw aan en werk het werkpakket bij.");
                        replyStatusView.setVisibility(View.VISIBLE);
                    }
                    return;
                }
                if (replyResponse != null) {
                    try {
                        JSONObject updated = new JSONObject(data.toString()), target = null;
                        JSONArray packs = updated.optJSONArray("packs");
                        for (int i = 0; packs != null && i < packs.length(); i++) {
                            JSONObject candidate = packs.optJSONObject(i);
                            JSONObject job = candidate == null ? null : candidate.optJSONObject("job");
                            if (job != null && jobId.equals(job.optString("id"))) target = candidate;
                        }
                        if (target != null) {
                            JSONArray saved = target.optJSONArray("questions"); if (saved == null) saved = new JSONArray();
                            JSONArray incoming = replyResponse.optJSONArray("questions"); JSONObject newestAnswer = null; boolean changed = false;
                            for (int i = 0; incoming != null && i < incoming.length(); i++) {
                                JSONObject latest = incoming.optJSONObject(i); if (latest == null || latest.optString("id").isEmpty()) continue;
                                JSONObject local = null;
                                for (int j = 0; j < saved.length(); j++) {
                                    JSONObject item = saved.optJSONObject(j);
                                    if (item != null && latest.optString("id").equals(item.optString("id"))) { local = item; break; }
                                }
                                String prior = local == null ? "open" : local.optString("replyStatus", "open");
                                if (local == null) {
                                    local = new JSONObject(latest.toString());
                                    JSONArray merged = new JSONArray().put(local);
                                    for (int j = 0; j < saved.length() && j < 19; j++) merged.put(saved.get(j));
                                    saved = merged; changed = true;
                                }
                                String latestStatus = latest.optString("replyStatus", "open");
                                String latestResponse = latest.isNull("response") ? null : latest.optString("response");
                                String latestReplyAt = latest.isNull("repliedAt") ? null : latest.optString("repliedAt");
                                if (!prior.equals(latestStatus) || !java.util.Objects.equals(local.isNull("response") ? null : local.optString("response"), latestResponse)
                                    || !java.util.Objects.equals(local.isNull("repliedAt") ? null : local.optString("repliedAt"), latestReplyAt)) changed = true;
                                local.put("replyStatus", latestStatus);
                                local.put("response", latestResponse == null ? JSONObject.NULL : latestResponse);
                                local.put("repliedAt", latestReplyAt == null ? JSONObject.NULL : latestReplyAt);
                                if (newestAnswer == null && !"answered".equals(prior) && "answered".equals(latestStatus)) newestAnswer = latest;
                            }
                            if (changed) { target.put("questions", saved); store.save(updated); data = updated; }
                            if (newestAnswer != null && replyStatusView != null) {
                                replyStatusView.setText("Nieuw goedgekeurd antwoord van kantoor op: " + newestAnswer.optString("message") + "\n" + newestAnswer.optString("response"));
                                replyStatusView.setVisibility(View.VISIBLE);
                                replyStatusView.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
                            }
                        }
                    } catch (Exception ignored) {
                        if (replyStatusView != null) { replyStatusView.setText("Antwoorden zijn niet bijgewerkt. Vernieuw het werkpakket voor de actuele status."); replyStatusView.setVisibility(View.VISIBLE); }
                    }
                }
                scheduleReplyRefresh();
            });
        });
    }
    private void rows(JSONArray rows) {
        for (int i=0;i<rows.length();i++) { JSONObject row=rows.optJSONObject(i); text(row.optString("title", row.optString("name", row.optString("toolName"))), 18);
            for (String key : new String[]{"body", "description", "status", "quantity", "unit", "expiresOn"}) { String value=row.optString(key, ""); if (!value.isEmpty() && !value.equals("null")) text(value, 16); } }
    }
    private void workTaskRows(JSONArray tasks) {
        for (int i = 0; tasks != null && i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i); if (task == null) continue;
            text(task.optString("title", "Taak"), 18);
            String description = task.optString("description", ""); if (!description.isEmpty()) text(description, 15);
            text(task.optString("status", "open") + (task.optString("plannedStart").isEmpty() ? "" : " · " + task.optString("plannedStart")), 14);
            JSONObject supervision = task.optJSONObject("supervision");
            if (task.optBoolean("supervisingOnly")) {
                text("Jij bent de aangewezen begeleider. Bekijk de taak; voortgang meldt de toegewezen uitvoerende.", 15);
                if (supervision != null && supervision.optBoolean("required")) {
                    text("Check-in in deze opgeslagen versie: " + (supervision.optBoolean("checkedIn") ? "vastgelegd" : "niet vastgelegd") + ". Vernieuw voor de actuele status.", 14);
                }
            } else if (supervision != null && supervision.optBoolean("required")) {
                text("Begeleider: " + supervision.optString("workerName", "Nog niet bekend") + " · " + supervision.optString("role", "Rol controleren"), 15);
                text("Check-in in deze opgeslagen versie: " + (supervision.optBoolean("checkedIn") ? "vastgelegd" : "niet vastgelegd") + ". Vernieuw voor de actuele status.", 14);
            }
            JSONArray requiredReleases = requiredStartReleases(pack(), task.optString("id"));
            for (int r = 0; r < requiredReleases.length(); r++) {
                JSONObject assignment = requiredReleases.optJSONObject(r), release = assignment == null ? null : assignment.optJSONObject("startRelease");
                text("Startvrijgave " + assignment.optString("role", "dienst") + ": "
                    + (release == null ? "niet uitgegeven" : release.optString("status", "onbekend"))
                    + " (opgeslagen versie; vernieuw online)", 14);
            }
        }
    }
    private JSONArray requiredStartReleases(JSONObject workPack, String taskId) {
        JSONArray result = new JSONArray(), assignments = workPack == null ? null : workPack.optJSONArray("assignments");
        for (int i = 0; assignments != null && i < assignments.length(); i++) {
            JSONObject assignment = assignments.optJSONObject(i); JSONArray taskIds = assignment == null ? null : assignment.optJSONArray("workBoardTaskIds");
            if (assignment == null || !assignment.optBoolean("startReleaseRequired")) continue;
            for (int j = 0; taskIds != null && j < taskIds.length(); j++) if (taskId.equals(taskIds.optString(j))) { result.put(assignment); break; }
        }
        return result;
    }
    private void startReleaseControls(JSONObject workPack) {
        JSONArray assignments = workPack.optJSONArray("assignments"); boolean found = false;
        for (int i = 0; assignments != null && i < assignments.length(); i++) {
            JSONObject assignment = assignments.optJSONObject(i);
            if (assignment == null || !assignment.optBoolean("startReleaseRequired")) continue;
            found = true;
            JSONObject release = assignment.optJSONObject("startRelease");
            String status = release == null ? "not_issued" : release.optString("status", "not_issued");
            text("Startvrijgave " + assignment.optString("role", "dienst") + ": " + status, 17);
            if (release != null && !release.optString("reason").isEmpty()) text("Instructie uitvoerder: " + release.optString("reason"), 15);
            if ("active".equals(status)) text("Serverbevestigd in deze opgeslagen versie tot " + release.optString("expiresAt") + ". Vernieuw online voor actuele status.", 14);
            if ("awaiting_worker".equals(status)) {
                text("Erkenning vereist voordat deze taak als gestart kan worden gemeld.", 14);
                CheckBox understood = new CheckBox(this); understood.setText("Ik heb de vrijgave ontvangen en stop als de omstandigheden of maatregelen afwijken."); content.addView(understood);
                button("Ontvangst vrijgave bevestigen (online)", () -> acknowledgeStartRelease(assignment, understood));
            }
            if (release != null && !release.optString("id").isEmpty() && ("active".equals(status) || "awaiting_worker".equals(status))) {
                EditText stopReason = input("Stop de vrijgave: reden of veranderde situatie", false);
                String reasonField = "startReleaseStopReason:" + release.optString("id");
                if (!assignment.optString(reasonField).isEmpty()) stopReason.setText(assignment.optString(reasonField));
                button("Stop en meld aan uitvoerder (online)", () -> stopStartRelease(assignment, stopReason));
            }
            if (!"active".equals(status) && !"awaiting_worker".equals(status)) text("Starten is niet vrijgegeven. Vernieuw online en neem contact op met de uitvoerder.", 14);
        }
        if (!found) text("Voor deze dienst is geen aanvullende supervisor-startvrijgave vereist.", 14);
        if (store.token.isEmpty()) text("Startvrijgave kan alleen met een online, geautoriseerde verbinding worden bevestigd.", 14);
    }
    private void acknowledgeStartRelease(JSONObject assignment, CheckBox understood) {
        if (!understood.isChecked()) { understood.setError("Bevestig eerst dat je de vrijgave hebt ontvangen"); return; }
        work(() -> {
            String jobId = pack().getJSONObject("job").getString("id");
            JSONObject release = assignment.optJSONObject("startRelease");
            if (release == null || !"awaiting_worker".equals(release.optString("status")) || release.optString("id").isEmpty())
                throw new IOException("Er staat geen actuele vrijgave op deze opgeslagen versie. Vernieuw het werkpakket online.");
            JSONObject updated = new JSONObject(data.toString()); JSONArray packs = updated.getJSONArray("packs"); JSONObject updatedPack = null;
            for (int i = 0; i < packs.length(); i++) if (jobId.equals(packs.getJSONObject(i).getJSONObject("job").optString("id"))) updatedPack = packs.getJSONObject(i);
            JSONObject updatedAssignment = null; JSONArray updatedAssignments = updatedPack == null ? null : updatedPack.optJSONArray("assignments");
            for (int i = 0; updatedAssignments != null && i < updatedAssignments.length(); i++)
                if (assignment.optString("id").equals(updatedAssignments.getJSONObject(i).optString("id"))) updatedAssignment = updatedAssignments.getJSONObject(i);
            if (updatedAssignment == null) throw new IOException("De toegewezen dienst ontbreekt in de lokale werkmap.");
            String keyField = "startReleaseAcknowledgmentEntryKey:" + release.getString("id");
            String entryKey = updatedAssignment.optString(keyField);
            if (entryKey.isEmpty()) { entryKey = UUID.randomUUID().toString(); updatedAssignment.put(keyField, entryKey); store.save(updated); data = updated; }
            JSONObject body = new JSONObject().put("releaseId", release.getString("id")).put("sourceHash", pack().getString("sourceHash"))
                .put("understood", true).put("entryKey", entryKey);
            JSONObject response = store.json("/api/ledger/jobs/" + FieldStore.encode(jobId) + "/work-pack/start-release/acknowledgment", body);
            JSONObject confirmed = response.optJSONObject("release");
            if (confirmed == null || !confirmed.optBoolean("permissionToStart") || !"active".equals(confirmed.optString("status")))
                throw new IOException("De server heeft geen actieve vrijgave bevestigd. Vernieuw de werkmap en controleer met de uitvoerder.");
            updatedAssignment.put("startRelease", confirmed); store.save(updated); data = updated;
        }, () -> { message = "De server heeft je ontvangst van de startvrijgave bevestigd."; showPack(); });
    }
    private void stopStartRelease(JSONObject assignment, EditText reasonInput) {
        String reason = reasonInput.getText().toString().trim();
        if (reason.length() < 3 || reason.length() > 1000) { reasonInput.setError("Beschrijf de reden (3-1000 tekens)"); return; }
        work(() -> {
            String jobId = pack().getJSONObject("job").getString("id");
            JSONObject release = assignment.optJSONObject("startRelease");
            if (release == null || release.optString("id").isEmpty()
                || !java.util.Arrays.asList("active", "awaiting_worker").contains(release.optString("status")))
                throw new IOException("De vrijgave is niet meer actief in deze werkmap. Vernieuw online.");
            JSONObject updated = new JSONObject(data.toString()); JSONArray packs = updated.getJSONArray("packs"); JSONObject updatedPack = null;
            for (int i = 0; i < packs.length(); i++) if (jobId.equals(packs.getJSONObject(i).getJSONObject("job").optString("id"))) updatedPack = packs.getJSONObject(i);
            JSONObject updatedAssignment = null; JSONArray updatedAssignments = updatedPack == null ? null : updatedPack.optJSONArray("assignments");
            for (int i = 0; updatedAssignments != null && i < updatedAssignments.length(); i++)
                if (assignment.optString("id").equals(updatedAssignments.getJSONObject(i).optString("id"))) updatedAssignment = updatedAssignments.getJSONObject(i);
            if (updatedAssignment == null) throw new IOException("De toegewezen dienst ontbreekt in de lokale werkmap.");
            String keyField = "startReleaseStopEntryKey:" + release.getString("id");
            String reasonField = "startReleaseStopReason:" + release.getString("id");
            String entryKey = updatedAssignment.optString(keyField);
            String retainedReason = updatedAssignment.optString(reasonField);
            if (!entryKey.isEmpty() && !retainedReason.equals(reason)) throw new IOException("Gebruik bij opnieuw proberen dezelfde reden als bij de eerste melding.");
            if (entryKey.isEmpty()) {
                entryKey = UUID.randomUUID().toString(); updatedAssignment.put(keyField, entryKey);
                updatedAssignment.put(reasonField, reason); store.save(updated); data = updated;
            }
            JSONObject body = new JSONObject().put("releaseId", release.getString("id")).put("entryKey", entryKey).put("reason", reason);
            JSONObject response = store.json("/api/ledger/jobs/" + FieldStore.encode(jobId) + "/work-pack/start-release/revoke", body);
            JSONObject stopped = response.optJSONObject("release");
            if (stopped == null || !"revoked".equals(stopped.optString("status")) || stopped.optBoolean("permissionToStart"))
                throw new IOException("De server heeft het stoppen niet bevestigd. Vernieuw de werkmap en neem contact op met de uitvoerder.");
            updatedAssignment.put("startRelease", stopped); store.save(updated); data = updated;
        }, () -> { message = "De server heeft de startvrijgave gestopt en de reden vastgelegd."; showPack(); });
    }
    private String taskTitle(JSONObject pack, String taskId) {
        JSONArray tasks = pack.optJSONArray("do");
        for (int i = 0; tasks != null && i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task != null && taskId.equals(task.optString("id"))) return task.optString("title", "Taak");
        }
        return "Taak";
    }
    private void recoveryInstructions(JSONObject pack) {
        JSONObject know = pack.optJSONObject("know");
        JSONArray instructions = know == null ? null : know.optJSONArray("recoveryInstructions");
        if (instructions == null || instructions.length() == 0) return;
        text("Bijgewerkte taakinstructies van kantoor", 21);
        for (int i = 0; i < instructions.length(); i++) {
            JSONObject instruction = instructions.optJSONObject(i);
            if (instruction == null) continue;
            text(taskTitle(pack, instruction.optString("taskId")), 18);
            text(instruction.optString("text"), 16);
            text("Vastgelegd: " + instruction.optString("recordedAt"), 14);
        }
        text("Bevestig het lezen van deze opgeslagen versie en meld hervatting bij dezelfde taak. De reactie gaat pas na synchronisatie naar kantoor. Dit is geen veiligheidsvrijgave.", 14);
    }
    private void safetyRows(JSONObject know) {
        text("Veiligheidsdossier - geen startvrijgave", 20);
        JSONObject review = know.optJSONObject("safetyReview");
        text(review == null ? "Dossierinformatie; dit is geen toestemming om te starten." : review.optString("notice"), 16);
        JSONArray plans = know.optJSONArray("safetyPlans");
        if (plans == null || plans.length() == 0) text("Geen plan gekoppeld aan deze actieve inschrijving. Vraag kantoor of dit van toepassing is.", 16);
        for (int i = 0; plans != null && i < plans.length(); i++) {
            JSONObject plan = plans.optJSONObject(i); if (plan == null) continue;
            text(plan.optString("planNumber") + " R" + plan.optInt("revisionNumber") + ": " + plan.optString("title"), 18);
            text(plan.optString("workDate") + " | " + plan.optString("shiftLabel") + " | " + plan.optString("location"), 15);
            JSONObject acknowledgement = plan.optJSONObject("ownAcknowledgement");
            text("Status: " + plan.optString("status") + " | Mijn bevestiging: " + (acknowledgement == null ? "niet vastgelegd" : acknowledgement.optString("status")), 15);
            text("Bronnen actueel: " + (plan.optBoolean("prerequisitesCurrent") ? "ja" : "nee") + " | Integriteit: " + (plan.optBoolean("definitionIntegrityValid") ? "geverifieerd" : "controleren"), 15);
            JSONArray steps = plan.optJSONArray("steps");
            for (int j = 0; steps != null && j < steps.length(); j++) {
                JSONObject step = steps.optJSONObject(j); if (step == null) continue;
                text(step.optString("description"), 16);
                text("Gevaren: " + join(step.optJSONArray("hazards")) + " | Maatregelen: " + join(step.optJSONArray("controls")), 15);
            }
            text("Noodmaatregelen: " + plan.optString("emergencyArrangements"), 15);
            textRows(plan.optJSONArray("stopWorkTriggers"), "Stopwerk: "); textRows(plan.optJSONArray("blockers"), "Controlepunt: ");
            JSONObject permit = plan.optJSONObject("permit");
            if (permit != null) {
                text("Werkvergunning: " + permit.optString("title") + " | " + permit.optString("status"), 17);
                textRows(permit.optJSONArray("hazards"), "Gevaar: "); textRows(permit.optJSONArray("controls"), "Maatregel: "); textRows(permit.optJSONArray("conditions"), "Voorwaarde: "); textRows(permit.optJSONArray("blockers"), "Controlepunt: ");
            }
        }
        JSONArray assessments = know.optJSONArray("lmraAssessments");
        for (int i = 0; assessments != null && i < assessments.length(); i++) {
            JSONObject item = assessments.optJSONObject(i); if (item == null) continue;
            text("Mijn LMRA: " + item.optString("workArea") + " | " + item.optString("activity") + " | " + item.optString("outcome"), 17);
            text("Bron actueel: " + (item.optBoolean("sourceCurrent") ? "ja" : "nee") + " | Integriteit: " + (item.optBoolean("integrityValid") ? "geverifieerd" : "controleren") + " | " + (item.optBoolean("isLatestForWorkerPlan") ? "Meest recent" : "Vervangen door nieuwere beoordeling") + (item.optBoolean("expired") ? " | Verlopen" : "") + " | Geldig tot: " + item.optString("validUntil"), 15);
            text(item.optString("stopWorkReason"), 15); textRows(item.optJSONArray("observedHazards"), "Waargenomen gevaar: "); textRows(item.optJSONArray("blockers"), "Controlepunt: ");
            JSONObject checks = item.optJSONObject("checks");
            if (checks != null) {
                Iterator<String> keys = checks.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    text(key + ": " + (checks.optBoolean(key) ? "bevestigd" : "niet bevestigd"), 15);
                }
            }
        }
    }
    private void safetyBriefingControls(JSONObject workPack) {
        JSONArray meetings = workPack.optJSONArray("safetyMeetings");
        text("Veiligheidsbriefings", 21);
        text("Erkenning legt alleen vast welke briefing je hebt gelezen en begrepen. Het is geen starttoestemming of veiligheidsvrijgave.", 14);
        if (meetings == null || meetings.length() == 0) { text("Geen aan jou toegewezen briefing opgeslagen. Vraag kantoor wat voor dit werk geldt.", 16); return; }
        String scope = data.optString("scope", ""), marker = ":field_worker:";
        int workerMarker = scope.lastIndexOf(marker);
        String workerId = workerMarker < 0 ? "" : scope.substring(workerMarker + marker.length());
        for (int i = 0; i < meetings.length(); i++) {
            JSONObject meeting = meetings.optJSONObject(i); if (meeting == null) continue;
            text(meeting.optString("title", "Veiligheidsbriefing"), 18);
            text(meeting.optString("scheduledAt") + " | " + meeting.optString("facilitator"), 14);
            JSONArray topics = meeting.optJSONArray("topics");
            for (int j = 0; topics != null && j < topics.length(); j++) text("Onderwerp: " + topics.optString(j), 15);
            JSONObject own = null; JSONArray attendees = meeting.optJSONArray("attendeeRecords");
            for (int j = 0; attendees != null && j < attendees.length(); j++) {
                JSONObject attendee = attendees.optJSONObject(j);
                if (attendee != null && workerId.equals(attendee.optString("workerId"))) own = attendee;
            }
            JSONObject pending = meeting.optJSONObject("pendingLocalAcknowledgement");
            if (pending != null) text("Erkenning lokaal bewaard: " + ("conflict".equals(pending.optString("state"))
                ? "conflict; ververs de briefing en bespreek dit met kantoor" : "nog niet door kantoor ontvangen"), 15);
            else if (own == null) text("Deze briefing is niet aan jouw uitvoerdersaccount toegewezen.", 15);
            else if ("acknowledged".equals(own.optString("status"))) text("Jouw erkenning is door kantoor ontvangen.", 15);
            else if ("excused".equals(own.optString("status"))) text("Kantoor heeft een expliciete uitzondering vastgelegd.", 15);
            else if ("expected".equals(own.optString("status")) && ("scheduled".equals(meeting.optString("status")) || "in_progress".equals(meeting.optString("status")))) {
                CheckBox understood = new CheckBox(this);
                understood.setText("Ik heb deze onderwerpen gelezen en begrepen. Als situatie of beheersing verandert, stop ik en overleg ik met kantoor.");
                content.addView(understood);
                EditText evidence = input("Bewijsreferentie briefing (minimaal 3 tekens)", false);
                button("Erkenning versleuteld lokaal bewaren", () -> {
                    if (!understood.isChecked()) { understood.setError("Bevestig eerst dat je de briefing hebt gelezen en begrepen."); return; }
                    JSONObject updated = null;
                    try {
                        updated = new JSONObject(data.toString()); JSONArray packs = updated.getJSONArray("packs"); JSONObject targetPack = null, targetMeeting = null;
                        String jobId = workPack.getJSONObject("job").getString("id");
                        for (int p = 0; p < packs.length(); p++) if (jobId.equals(packs.getJSONObject(p).getJSONObject("job").optString("id"))) targetPack = packs.getJSONObject(p);
                        JSONArray currentMeetings = targetPack == null ? null : targetPack.optJSONArray("safetyMeetings");
                        for (int m = 0; currentMeetings != null && m < currentMeetings.length(); m++) if (meeting.optString("id").equals(currentMeetings.getJSONObject(m).optString("id"))) targetMeeting = currentMeetings.getJSONObject(m);
                        if (targetPack == null || targetMeeting == null) throw new IOException("Werkpakket of briefing ontbreekt. Ververs de werkmap.");
                        store.queueSafetyBriefingAcknowledgement(updated, targetPack, targetMeeting, evidence.getText().toString().trim(), System.currentTimeMillis());
                        store.save(updated); data = updated; selectedJob = jobId;
                    } catch (Exception error) { message = error.getMessage(); showPack(); return; }
                    message = "De briefing-erkenning is versleuteld op deze telefoon bewaard; kantoor heeft deze nog niet ontvangen."; showPack();
                });
            }
        }
    }
    private String join(JSONArray values) {
        if (values == null) return "";
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < values.length(); i++) { if (i > 0) result.append("; "); result.append(values.optString(i)); }
        return result.toString();
    }
    private void textRows(JSONArray values, String prefix) {
        for (int i = 0; values != null && i < values.length(); i++) text(prefix + values.optString(i), 15);
    }
    private void dailyBriefings(JSONArray assignments) {
        text("Dagstart van deze dienst", 21);
        boolean shown = false;
        for (int i = 0; assignments != null && i < assignments.length(); i++) {
            JSONObject assignment = assignments.optJSONObject(i);
            JSONObject briefing = assignment == null ? null : assignment.optJSONObject("dailyBriefing");
            if (briefing == null) continue;
            String status = briefing.optString("status", "not_recorded");
            if (status.equals("ready")) {
                shown = true;
                text(briefing.optString("plannedWork"), 16);
                text("Productiedoel: " + briefing.optString("productionTarget"), 15);
                text("Weer: " + briefing.optString("weather"), 15);
                text("Omstandigheden: " + briefing.optString("siteConditions"), 15);
                text("Veiligheid: " + briefing.optString("safetyFocus"), 15);
                textRows(briefing.optJSONArray("qualityHoldPoints"), "Kwaliteitscontrole: ");
                textRows(briefing.optJSONArray("constraints"), "Beperking: ");
            } else if (status.equals("crew_update_required") || status.equals("needs_review")) {
                shown = true;
                text("De vastgelegde dagstart geldt niet voor deze exacte dienst. Vraag de uitvoerder om de ploeg opnieuw te briefen voordat je begint.", 16);
            } else {
                text("Er is nog geen dagstart voor deze dienst vastgelegd.", 15);
            }
        }
        if (!shown && (assignments == null || assignments.length() == 0)) text("Geen dagstart beschikbaar voor deze dienst.", 15);
    }
    private void showPack() {
        if (data.optLong("expiresAt") <= System.currentTimeMillis()) { showJobs(); return; }
        closePdf(); JSONObject pack = pack(); if (pack == null) { showJobs(); return; }
        replyPollingStopped = false;
        JSONObject job = pack.optJSONObject("job"); page(job.optString("title")); text(job.optString("address") + " " + job.optString("city"), 16);
        packVisible = true;
        replyStatusView = text("", 15); replyStatusView.setVisibility(View.GONE);
        scheduleReplyRefresh();
        text("Mijn ingeplande diensten", 21);
        JSONArray assignments = pack.optJSONArray("assignments");
        if (assignments == null || assignments.length() == 0) text("Geen diensttijden opgeslagen. Neem voor vertrek contact op met kantoor.", 16);
        else for (int i = 0; i < assignments.length(); i++) {
            JSONObject assignment = assignments.optJSONObject(i); if (assignment == null) continue;
            text(assignment.optString("role", "Uitvoering"), 18);
            text(assignment.optString("scheduledStart", "Starttijd niet vastgelegd") + " - " + assignment.optString("scheduledEnd", "Eindtijd niet vastgelegd"), 16);
            double hours = assignment.optDouble("allocationHours", 0); if (hours > 0) text(hours + " toegewezen uren", 15);
        }
        String sourceHash = pack.optString("sourceHash", "");
        text("Versie " + (sourceHash.length() >= 10 ? sourceHash.substring(0, 10) : "onbekend")
            + " | " + DateFormat.getDateTimeInstance().format(new Date(pack.optLong("savedAt"))), 15);
        if (!store.token.isEmpty()) button("Werkpakket en antwoorden bijwerken", () -> download(selectedJob));
        text("Kunnen", 21); rows(pack.optJSONArray("can")); text("Weten", 21); text(job.optString("description"), 16); rows(pack.optJSONObject("know").optJSONArray("instructions")); dailyBriefings(assignments); recoveryInstructions(pack);
        text("Tekeningen", 21); JSONArray files=pack.optJSONArray("offlineFiles");
        if (files != null) for (int i=0;i<files.length();i++) { JSONObject file=files.optJSONObject(i); button("PDF: " + file.optString("filename"), () -> openPdf(file)); }
        safetyRows(pack.optJSONObject("know"));
        safetyBriefingControls(pack);
        text("Hebben", 21); siteIssueControls(pack); rows(pack.optJSONObject("have").optJSONArray("materials")); rows(pack.optJSONObject("have").optJSONArray("equipment"));
        text("Doen", 21); workTaskRows(pack.optJSONArray("do")); rows(pack.optJSONObject("checks").optJSONArray("quality")); rows(pack.optJSONObject("checks").optJSONArray("photos"));
        text("Startvrijgave", 21); startReleaseControls(pack);
        JSONArray questions = pack.optJSONArray("questions");
        if (questions != null && questions.length() > 0) {
            text("Mijn vragen aan kantoor", 21);
            for (int i = 0; i < questions.length(); i++) {
                JSONObject item = questions.optJSONObject(i); if (item == null) continue;
                text(item.optString("message"), 16);
                String state = item.optString("replyStatus", "open");
                text(state.equals("answered") ? "Antwoord van kantoor" : state.equals("pending_approval") ? "Antwoord wacht op goedkeuring" : state.equals("review_required") ? "Antwoord wordt opnieuw beoordeeld" : "Wacht op antwoord van kantoor", 15);
                if (!item.optString("response").isEmpty() && !item.isNull("response")) text(item.optString("response"), 16);
            }
        }
        photoEvidenceControls(pack);
        text("Voortgang melden", 21);
        JSONArray tasks = pack.optJSONArray("do");
        List<String> taskIds = new ArrayList<>(); List<String> taskLabels = new ArrayList<>();
        if (tasks != null) for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i); if (task == null) continue;
            String status = task.optString("status", "open");
            if (task.optBoolean("supervisingOnly") || (!status.equals("open") && !status.equals("in_progress") && !status.equals("blocked"))) continue;
            taskIds.add(task.optString("id")); taskLabels.add(task.optString("title", "Taak"));
        }
        Spinner progressTask = new Spinner(this);
        progressTask.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, taskLabels));
        progressTask.setEnabled(!taskIds.isEmpty()); content.addView(progressTask);
        if (taskIds.isEmpty()) text("Geen open taken in deze opgeslagen werkmap.", 16);
        Spinner progressStatus = new Spinner(this); String[] progressOptions = {"Bezig", "Geblokkeerd"}; progressStatus.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, progressOptions)); content.addView(progressStatus);
        List<String> reservationIds = new ArrayList<>(); List<String> reservationTasks = new ArrayList<>(); List<String> equipmentLabels = new ArrayList<>();
        equipmentLabels.add("Geen materieeldefect melden"); reservationIds.add(""); reservationTasks.add("");
        JSONObject have = pack().optJSONObject("have"); JSONArray equipment = have == null ? null : have.optJSONArray("equipment");
        if (equipment != null) for (int i = 0; i < equipment.length(); i++) {
            JSONObject item = equipment.optJSONObject(i), custody = item == null ? null : item.optJSONObject("custody");
            if (item == null || custody == null || !"checked_out".equals(custody.optString("status")) || !custody.optBoolean("heldByYou")) continue;
            reservationIds.add(item.optString("id")); reservationTasks.add(item.optString("taskId"));
            equipmentLabels.add(item.optString("toolName", "Materieel") + " · " + item.optString("taskTitle", "Taak"));
        }
        text("Materieeldefect (optioneel, alleen bij geblokkeerde taak)", 16);
        Spinner equipmentSelection = new Spinner(this); equipmentSelection.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, equipmentLabels)); content.addView(equipmentSelection);
        Spinner equipmentIssueType = new Spinner(this); equipmentIssueType.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"Storing", "Beschadigd", "Onveilig"})); content.addView(equipmentIssueType);
        text("Stop het gebruik. Een melding houdt materieel vast; alleen inspectie of afgerond onderhoud kan het vrijgeven.", 14);
        EditText progressPercent = input("Voortgang (0-100%)", false); progressPercent.setSingleLine(true); progressPercent.setInputType(InputType.TYPE_CLASS_NUMBER);
        EditText progressNote = input("Wat is uitgevoerd of wat blokkeert?", false);
        button("Voortgang lokaal bewaren", () -> {
            if (taskIds.isEmpty()) { message="Er staan geen open taken in dit werkpakket."; showPack(); return; }
            int percent;
            try { percent = Integer.parseInt(progressPercent.getText().toString().trim()); }
            catch (NumberFormatException error) { progressPercent.setError("Vul een percentage van 0 tot 100 in"); return; }
            String note = progressNote.getText().toString().trim();
            if (percent < 0 || percent > 100) { progressPercent.setError("Gebruik een percentage van 0 tot 100"); return; }
            if (note.length() < 3 || note.length() > 2000) { progressNote.setError("Beschrijf de voortgang of blokkade (3-2000 tekens)"); return; }
            String status = progressStatus.getSelectedItemPosition() == 1 ? "blocked" : "in_progress";
            String taskId = taskIds.get(progressTask.getSelectedItemPosition());
            int equipmentIndex = equipmentSelection.getSelectedItemPosition();
            String reservationId = equipmentIndex >= 0 && equipmentIndex < reservationIds.size() ? reservationIds.get(equipmentIndex) : "";
            if (!reservationId.isEmpty() && (!"blocked".equals(status) || !taskId.equals(reservationTasks.get(equipmentIndex)) || note.length() < 8)) {
                progressNote.setError("Materieelmelding vereist een geblokkeerde bijbehorende taak en minimaal 8 tekens toelichting"); return;
            }
            if ("in_progress".equals(status) && requiredStartReleases(pack(), taskId).length() > 0) {
                if (!store.token.isEmpty() && !hasAcknowledgedStartReleases(taskId)) {
                    message = "De toegewezen startvrijgave ontbreekt of is niet bevestigd. Vernieuw online en neem contact op met de uitvoerder."; showPack(); return;
                }
                reportReleasedTaskProgress(taskId, percent, note);
            } else queueProgress(taskId, status, percent, note, reservationId, equipmentIssueType.getSelectedItemPosition());
        });
        CheckBox read = new CheckBox(this); read.setText("Ik heb deze opgeslagen versie gelezen"); content.addView(read);
        button("Leesbevestiging lokaal bewaren", () -> { if (!read.isChecked()) { read.setError("Bevestig het lezen eerst"); return; } queue("acknowledgments", ""); });
        EditText question = input("Vraag of blokkade", false);
        button("Vraag lokaal bewaren", () -> queue("questions", question.getText().toString().trim()));
        button("Wachtrij", this::showQueue); button("Alle werkpakketten", this::showJobs);
    }
    private void photoEvidenceControls(JSONObject workPack) {
        text("Fotobewijs", 21);
        JSONArray sets = workPack.optJSONObject("checks").optJSONArray("photos");
        if (sets == null || sets.length() == 0) { text("Geen fotocontroles toegewezen.", 16); return; }
        List<String> ids = new ArrayList<>(), labels = new ArrayList<>();
        for (int i = 0; i < sets.length(); i++) {
            JSONObject set = sets.optJSONObject(i); if (set == null) continue;
            ids.add(set.optString("id"));
            labels.add(set.optString("title", "Fotocontrole") + (set.optString("workLocation").isEmpty() ? "" : " · " + set.optString("workLocation")));
        }
        Spinner selected = new Spinner(this); selected.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels)); content.addView(selected);
        TextView nextPhase = text("", 16);
        Runnable refreshPhase = () -> {
            try {
                String phase = FieldStore.nextPhotoPhase(workPack, ids.get(selected.getSelectedItemPosition()), data.optJSONArray("queue"));
                nextPhase.setText(phase.isEmpty() ? "Alle fasen staan in de werkmap." : "Vereiste volgende foto: " + phaseLabel(phase));
            } catch (Exception error) { nextPhase.setText("Fotofase niet beschikbaar."); }
        };
        selected.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) { refreshPhase.run(); }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { nextPhase.setText(""); }
        });
        EditText notes = input("Toelichting bij de foto (optioneel)", false);
        text("De foto wordt lokaal versleuteld bewaard en na synchronisatie door kantoor beoordeeld. Foto's worden verkleind tot maximaal 2 MB; locatiegegevens uit fotometadata worden verwijderd.", 14);
        button("Foto maken en offline bewaren", () -> {
            if (ids.isEmpty()) { message = "Er is geen toegewezen fotocontrole."; showPack(); return; }
            String phase;
            try { phase = FieldStore.nextPhotoPhase(workPack, ids.get(selected.getSelectedItemPosition()), data.optJSONArray("queue")); }
            catch (Exception error) { message = error.getMessage(); showPack(); return; }
            if (phase.isEmpty()) { message = "Alle verplichte fasen zijn al vastgelegd."; showPack(); return; }
            if (notes.getText().length() > 1000) { notes.setError("Maximaal 1.000 tekens"); return; }
            launchCamera(workPack.optJSONObject("job").optString("id"), ids.get(selected.getSelectedItemPosition()), notes.getText().toString());
        });
    }
    private static String phaseLabel(String phase) { return "before".equals(phase) ? "voor het werk" : "during".equals(phase) ? "tijdens het werk" : "na het werk"; }
    private void siteIssueControls(JSONObject workPack) {
        JSONObject have = workPack.optJSONObject("have");
        JSONArray issues = have == null ? null : have.optJSONArray("siteIssues");
        if (issues == null || issues.length() == 0) { text("Geen magazijnleveringen opgeslagen voor deze opdracht.", 15); return; }
        for (int i = 0; i < issues.length(); i++) {
            JSONObject issue = issues.optJSONObject(i); if (issue == null) continue;
            String issueId = issue.optString("id"); double remaining = issue.optDouble("remainingQuantity", 0);
            text(issue.optString("materialName", "Materiaal") + " · " + issue.optString("dispatchReference"), 18);
            text("Verwacht: " + issue.optString("expectedArrivalAt", "tijd niet vastgelegd")
                + " | Open: " + remaining + " " + issue.optString("unit") + " | Serverstatus: " + issue.optString("status"), 15);
            text("Volgens kantoor ontvangen: " + issue.optDouble("receivedQuantity", 0) + " " + issue.optString("unit")
                + " | geaccepteerd: " + issue.optDouble("acceptedQuantity", 0) + " " + issue.optString("unit"), 15);
            JSONArray receipts = issue.optJSONArray("receipts");
            for (int j = 0; receipts != null && j < receipts.length(); j++) {
                JSONObject receipt = receipts.optJSONObject(j); if (receipt == null) continue;
                text("Bevestigd " + receipt.optString("receivedAt") + ": " + receipt.optDouble("receivedQuantity") + " ontvangen, "
                    + receipt.optDouble("acceptedQuantity") + " akkoord, " + receipt.optDouble("damagedQuantity") + " beschadigd"
                    + " | bon " + receipt.optString("receiptReference"), 14);
            }
            if (remaining <= 0) { text("Deze levering is volledig ontvangen volgens de laatst opgeslagen serverstatus.", 15); continue; }
            EditText received = quantityInput("Nu ontvangen " + issue.optString("unit"));
            EditText accepted = quantityInput("Goedgekeurd " + issue.optString("unit"));
            EditText damaged = quantityInput("Beschadigd " + issue.optString("unit"));
            accepted.setText("0"); damaged.setText("0");
            EditText receiptReference = input("Ontvangstbon of leveringsreferentie", false);
            EditText evidenceReference = input("Bewijsreferentie (bon/foto)", false);
            EditText location = input("Waar is de levering neergezet?", false);
            text("Alleen na synchronisatie telt de geaccepteerde hoeveelheid mee als beschikbaar op de bouwplaats.", 14);
            button("Ontvangst lokaal bewaren", () -> {
                final double receivedValue, acceptedValue, damagedValue;
                try {
                    receivedValue = parseQuantity(received); acceptedValue = parseQuantity(accepted); damagedValue = parseQuantity(damaged);
                } catch (IOException error) { received.setError(error.getMessage()); return; }
                final String receiptValue = receiptReference.getText().toString();
                final String evidenceValue = evidenceReference.getText().toString();
                final String locationValue = location.getText().toString();
                work(() -> {
                    if (data.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline werkmap verlopen. Meld je online aan voor herstel.");
                    JSONObject updated = new JSONObject(data.toString()), target = null;
                    JSONArray packs = updated.getJSONArray("packs");
                    for (int j = 0; j < packs.length(); j++) {
                        JSONObject candidate = packs.optJSONObject(j);
                        if (candidate != null && selectedJob.equals(candidate.optJSONObject("job").optString("id"))) target = candidate;
                    }
                    if (target == null) throw new IOException("De opdracht ontbreekt in de offline werkmap.");
                    store.queueSiteReceipt(updated, target, issueId, receivedValue, acceptedValue, damagedValue,
                        receiptValue, evidenceValue, locationValue);
                    store.save(updated); data = updated;
                }, () -> { message = "Leveringsontvangst versleuteld op deze telefoon bewaard; nog niet door kantoor verwerkt."; showQueue(); });
            });
        }
    }
    private EditText quantityInput(String label) {
        EditText field = input(label, false); field.setSingleLine(true);
        field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        return field;
    }
    private static double parseQuantity(EditText field) throws IOException {
        String raw = field.getText().toString().trim().replace(',', '.');
        try { double value = Double.parseDouble(raw); if (!Double.isFinite(value)) throw new NumberFormatException(); return value; }
        catch (NumberFormatException error) { throw new IOException("Vul een geldig aantal in (maximaal vier decimalen). "); }
    }
    private void launchCamera(String jobId, String setId, String notes) {
        try {
            File directory = new File(getCacheDir(), "photo-capture");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("De tijdelijke cameramap kan niet worden gemaakt.");
            pendingPhotoFile = new File(directory, UUID.randomUUID() + ".jpg");
            pendingPhotoJobId = jobId; pendingPhotoSetId = setId; pendingPhotoNotes = notes.trim();
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            Uri output = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pendingPhotoFile);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, output); intent.setClipData(ClipData.newRawUri("Contractor.AI foto", output));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(intent, CAMERA_REQUEST);
        } catch (Exception error) {
            if (pendingPhotoFile != null) pendingPhotoFile.delete(); clearPendingPhoto();
            new AlertDialog.Builder(this).setTitle("Camera niet beschikbaar").setMessage(error.getMessage()).setPositiveButton("Sluiten", null).show();
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent result) {
        super.onActivityResult(requestCode, resultCode, result);
        if (requestCode != CAMERA_REQUEST) return;
        if (resultCode != RESULT_OK || pendingPhotoFile == null) {
            if (pendingPhotoFile != null) pendingPhotoFile.delete(); clearPendingPhoto();
            if (data != null) showPack(); return;
        }
        final File image = pendingPhotoFile;
        final String jobId = pendingPhotoJobId, setId = pendingPhotoSetId, caption = pendingPhotoNotes;
        final long capturedAt = System.currentTimeMillis();
        work(() -> {
            try {
                if (data == null) data = store.load();
                if (data == null || data.optLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline werkmap verlopen of ontbreekt; de foto is niet bewaard.");
                byte[] bytes = FieldStore.normalizePhoto(image);
                JSONObject updated = new JSONObject(data.toString()), target = null;
                JSONArray packs = updated.getJSONArray("packs");
                for (int i = 0; i < packs.length(); i++) if (jobId.equals(packs.getJSONObject(i).getJSONObject("job").optString("id"))) target = packs.getJSONObject(i);
                if (target == null) throw new IOException("De opdracht ontbreekt in de offline werkmap.");
                store.queuePhoto(updated, target, setId, FieldStore.nextPhotoPhase(target, setId, updated.optJSONArray("queue")), bytes, caption, capturedAt);
                store.save(updated); data = updated; selectedJob = jobId;
            } finally { image.delete(); clearPendingPhoto(); }
        }, () -> { message = "Foto versleuteld op deze telefoon bewaard; nog niet door kantoor ontvangen."; showQueue(); });
    }
    private void clearPendingPhoto() { pendingPhotoFile = null; pendingPhotoJobId = ""; pendingPhotoSetId = ""; pendingPhotoNotes = ""; }
    private void clearStaleCameraFiles() {
        File directory = new File(getCacheDir(), "photo-capture"); File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) if (pendingPhotoFile == null || !file.equals(pendingPhotoFile)) file.delete();
    }
    private void queue(String kind, String body) {
        work(() -> {
            if (data.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline versie verlopen. Meld je online aan voor herstel.");
            if (kind.equals("questions") && (body.length() < 3 || body.length() > 4000)) throw new IOException("Een vraag moet 3-4000 tekens bevatten.");
            JSONObject updated = new JSONObject(data.toString()); JSONArray queue = updated.getJSONArray("queue");
            if (queue.length() >= 100) throw new IOException("De wachtrij is vol.");
            JSONObject payload = new JSONObject().put("entryKey", UUID.randomUUID().toString()).put("sourceHash", pack().getString("sourceHash"));
            if (kind.equals("questions")) payload.put("message", body); else payload.put("understood", true);
            queue.put(new JSONObject().put("jobId", selectedJob).put("kind", kind).put("payload", payload).put("state", "pending"));
            store.save(updated); data = updated;
        }, () -> { message="Op de telefoon bewaard; nog niet door kantoor ontvangen."; showQueue(); });
    }
    private void queueProgress(String taskId, String status, int percent, String note, String reservationId, int issueTypeIndex) {
        work(() -> {
            if (data.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline versie verlopen. Meld je online aan voor herstel.");
            JSONObject updated = new JSONObject(data.toString()); JSONArray queue = updated.getJSONArray("queue");
            if (queue.length() >= 100) throw new IOException("De wachtrij is vol.");
            JSONObject payload = new JSONObject().put("entryKey", UUID.randomUUID().toString()).put("sourceHash", pack().getString("sourceHash"))
                .put("taskId", taskId).put("status", status).put("progressPercent", percent).put("note", note);
            if (reservationId != null && !reservationId.isEmpty()) {
                String[] issueTypes = {"malfunction", "damaged", "unsafe"};
                JSONArray reservations = pack().optJSONObject("have").optJSONArray("equipment");
                boolean scoped = false;
                if (reservations != null) for (int i = 0; i < reservations.length(); i++) {
                    JSONObject reservation = reservations.optJSONObject(i), custody = reservation == null ? null : reservation.optJSONObject("custody");
                    if (reservation != null && reservationId.equals(reservation.optString("id")) && taskId.equals(reservation.optString("taskId"))
                        && custody != null && "checked_out".equals(custody.optString("status")) && custody.optBoolean("heldByYou")) scoped = true;
                }
                if (!"blocked".equals(status) || note.length() < 8 || !scoped) throw new IOException("Kies alleen materieel dat voor deze geblokkeerde taak aan jou is uitgegeven.");
                payload.put("equipmentIssue", new JSONObject().put("reservationId", reservationId)
                    .put("issueType", issueTypes[Math.max(0, Math.min(issueTypes.length - 1, issueTypeIndex))]).put("note", note));
            }
            queue.put(new JSONObject().put("jobId", selectedJob).put("kind", "progress").put("payload", payload).put("state", "pending"));
            store.save(updated); data = updated;
        }, () -> { message="Voortgang lokaal bewaard; nog niet door kantoor ontvangen."; showQueue(); });
    }
    private void reportReleasedTaskProgress(String taskId, int percent, String note) {
        work(() -> {
            if (store.token.isEmpty()) throw new IOException("Voor deze taak is een actuele servercontrole vereist. Maak online verbinding; je kunt wel offline een blokkade melden.");
            String sourceHash = pack().getString("sourceHash");
            JSONObject body = new JSONObject().put("entryKey", UUID.randomUUID().toString()).put("sourceHash", sourceHash)
                .put("taskId", taskId).put("status", "in_progress").put("progressPercent", percent).put("note", note);
            store.json("/api/ledger/jobs/" + FieldStore.encode(selectedJob) + "/work-pack/progress", body);
        }, () -> { message = "Voortgang naar de server gestuurd; startvrijgave en actuele taakstatus zijn gecontroleerd."; download(selectedJob); });
    }
    private boolean hasAcknowledgedStartReleases(String taskId) {
        JSONArray required = requiredStartReleases(pack(), taskId);
        for (int i = 0; i < required.length(); i++) {
            JSONObject assignment = required.optJSONObject(i), release = assignment == null ? null : assignment.optJSONObject("startRelease");
            if (release == null || !release.optBoolean("permissionToStart") || !"active".equals(release.optString("status"))) return false;
        }
        return required.length() > 0;
    }
    private void showQueue() {
        page("Wachtrij"); JSONArray queue=data.optJSONArray("queue");
        JSONArray availabilityResults = data.optJSONArray("availabilitySyncResults");
        if (availabilityResults != null && availabilityResults.length() > 0) {
            text("Er zijn serverbevestigde beschikbaarheidsmeldingen die nog bekeken moeten worden.", 16);
            button("Resultaten beschikbaarheid (" + availabilityResults.length() + ")", () -> showAvailabilityResults(availabilityResults));
        }
        for (int i=0;i<queue.length();i++) { JSONObject entry=queue.optJSONObject(i), payload=entry.optJSONObject("payload");
            String kind = entry.optString("kind");
            JSONObject equipmentIssue = payload.optJSONObject("equipmentIssue");
            String summary = kind.equals("progress") && equipmentIssue != null
                ? "MATERIEEL VASTGEHOUDEN · " + equipmentIssue.optString("issueType") + ": " + equipmentIssue.optString("note")
                : kind.equals("progress") ? "Voortgang " + payload.optInt("progressPercent") + "%: " + payload.optString("note")
                : kind.equals("evidence") ? "Foto " + phaseLabel(payload.optString("phase")) + ": " + payload.optString("notes", "zonder toelichting")
                : kind.equals("site_receipt") ? "Bouwplaatsontvangst " + payload.optDouble("receivedQuantity") + " " + payload.optString("receiptReference")
                : kind.equals("safety_briefing_acknowledgement") ? "Erkenning veiligheidsbriefing " + entry.optString("meetingId")
                : kind.equals("availability") ? ("standby".equals(payload.optString("mode")) ? "Standby op afroep" : "Niet beschikbaar")
                    + " vanaf " + displayDateTime(payload.optString("startsAt"))
                    + (payload.optBoolean("returnUnknown") ? " · terugkeer onbekend" : " tot " + displayDateTime(payload.optString("endsAt")))
                    + ("standby".equals(payload.optString("mode")) ? " · minimaal " + payload.optInt("minimumNoticeHours") + " uur aankondiging" : "")
                : payload.optString("message", "Leesbevestiging");
            text(summary, 18);
            String conflict = "availability".equals(kind)
                ? "Serverconflict. Meld opnieuw aan en bespreek deze periode met kantoor voordat je een nieuwe melding maakt."
                : "site_receipt".equals(kind)
                ? "Levering of open hoeveelheid gewijzigd. Controleer bon en aantallen met kantoor; dit wordt niet automatisch opnieuw verwerkt."
                : "Bron gewijzigd. Deze reactie wordt niet automatisch opnieuw gekoppeld.";
            text(entry.optString("state").equals("conflict") ? conflict : "Nog niet ontvangen door kantoor", 15);
            button("Lokale reactie verwijderen", () -> new AlertDialog.Builder(this).setMessage("Deze niet-verzonden reactie van de telefoon verwijderen?").setNegativeButton("Annuleren", null).setPositiveButton("Verwijderen", (d,w) -> removeEntry(entry.optJSONObject("payload").optString("entryKey"))).show()); }
        if (!store.token.isEmpty()) button("Synchroniseren", this::sync); else button("Online aanmelden voor synchronisatie", this::showLogin);
        button("Werkpakketten", this::showJobs);
    }
    private void removeEntry(String key) {
        work(() -> {
            JSONObject updated = new JSONObject(data.toString()); JSONArray queue = updated.getJSONArray("queue");
            for (int i = queue.length() - 1; i >= 0; i--) {
                JSONObject entry = queue.getJSONObject(i), payload = entry.getJSONObject("payload");
                if (!payload.optString("entryKey").equals(key)) continue;
                if ("evidence".equals(entry.optString("kind"))) removePendingPhotoPhase(updated, entry.optString("jobId"), payload.optString("setId"), payload.optString("phase"));
                queue.remove(i);
            }
            store.save(updated); data = updated;
        }, this::showQueue);
    }
    private void removePendingPhotoPhase(JSONObject source, String jobId, String setId, String phase) throws Exception {
        JSONArray packs = source.optJSONArray("packs"); if (packs == null) return;
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i); if (!jobId.equals(pack.optJSONObject("job").optString("id"))) continue;
            JSONArray sets = pack.optJSONObject("checks").optJSONArray("photos"); if (sets == null) return;
            for (int j = 0; j < sets.length(); j++) {
                JSONObject set = sets.getJSONObject(j); if (!setId.equals(set.optString("id"))) continue;
                JSONArray pending = set.optJSONArray("pendingPhotoPhases"), remaining = new JSONArray();
                if (pending != null) for (int k = 0; k < pending.length(); k++) if (!phase.equals(pending.optString(k))) remaining.put(pending.get(k));
                set.put("pendingPhotoPhases", remaining); return;
            }
        }
    }
    private void sync() {
        work(() -> {
            String scope=FieldStore.scope(store.json("/api/session", null).getJSONObject("operator"));
            if (!scope.equals(data.getString("scope")) || !store.origin.equals(data.getString("origin"))) throw new IOException("Synchroniseer met de oorspronkelijke server en uitvoerder.");
            JSONObject updated=new JSONObject(data.toString()); JSONArray queue=updated.getJSONArray("queue");
            List<JSONObject> ordered = new ArrayList<>();
            for (int i = 0; i < queue.length(); i++) ordered.add(queue.getJSONObject(i));
            ordered.sort((left, right) -> Integer.compare(syncPriority(left.optString("kind")), syncPriority(right.optString("kind"))));
            JSONArray sortedQueue = new JSONArray(); for (JSONObject entry : ordered) sortedQueue.put(entry);
            updated.put("queue", sortedQueue); queue = sortedQueue;
            for (int i=0;i<queue.length();) {
                JSONObject entry=queue.getJSONObject(i); if (entry.optString("state").equals("conflict")) { i++; continue; }
                try {
                    if ("evidence".equals(entry.optString("kind"))) {
                        JSONObject payload = entry.getJSONObject("payload");
                        byte[] image = android.util.Base64.decode(payload.getString("fileBase64"), android.util.Base64.DEFAULT);
                        JSONObject fields = new JSONObject().put("jobId", entry.getString("jobId")).put("category", "governed_field_photo")
                            .put("photoEvidenceSetId", payload.getString("setId")).put("photoEvidencePhase", payload.getString("phase"))
                            .put("photoEvidenceEntryKey", payload.getString("entryKey")).put("capturedAt", payload.getString("capturedAt"))
                            .put("notes", payload.optString("notes", ""));
                        JSONObject response = new JSONObject(new String(store.uploadPhoto("/api/ledger/upload", fields, image, payload.getString("filename"), payload.getString("entryKey")), java.nio.charset.StandardCharsets.UTF_8));
                        if (!response.optBoolean("success")) throw new IOException("De fotoserver heeft de foto niet bevestigd.");
                        markPhotoCaptured(updated, entry.getString("jobId"), payload.getString("setId"), payload.getString("phase"));
                    } else if ("site_receipt".equals(entry.optString("kind"))) {
                        JSONObject payload = entry.getJSONObject("payload"); String jobId = entry.getString("jobId"), issueId = entry.getString("issueId");
                        String path = "/api/ledger/jobs/" + FieldStore.encode(jobId) + "/material-stock-site-issues/" + FieldStore.encode(issueId) + "/receipts";
                        JSONObject response = store.json(path, payload);
                        retainSiteIssue(updated, jobId, issueId, response.optJSONObject("issue"));
                    } else if ("availability".equals(entry.optString("kind"))) {
                        JSONObject response = store.json("/api/work-board/availability", entry.getJSONObject("payload"));
                        JSONArray confirmed = updated.optJSONArray("availabilitySyncResults");
                        if (confirmed == null) confirmed = new JSONArray();
                        confirmed.put(availabilityReceipt(response)); updated.put("availabilitySyncResults", confirmed);
                    } else if ("safety_briefing_acknowledgement".equals(entry.optString("kind"))) {
                        String jobId = entry.getString("jobId"), meetingId = entry.getString("meetingId");
                        String path = "/api/ledger/jobs/" + FieldStore.encode(jobId) + "/safety-meetings/" + FieldStore.encode(meetingId) + "/acknowledgments";
                        JSONObject response = store.json(path, entry.getJSONObject("payload"));
                        retainSafetyMeeting(updated, jobId, response.optJSONObject("safetyMeeting"));
                    } else {
                        JSONObject response = store.json("/api/ledger/jobs/" + FieldStore.encode(entry.getString("jobId")) + "/work-pack/" + entry.getString("kind"), entry.getJSONObject("payload"));
                        if ("questions".equals(entry.optString("kind"))) retainSyncedQuestion(updated, entry.getString("jobId"), response.optJSONObject("record"));
                    }
                    queue.remove(i);
                }
                catch (FieldStore.ApiError error) { if (error.status == 409) {
                    entry.put("state", "conflict");
                    if ("safety_briefing_acknowledgement".equals(entry.optString("kind"))) markSafetyBriefingConflict(updated, entry.getString("jobId"), entry.getString("meetingId"));
                    i++;
                } else throw error; }
                store.save(updated); data=new JSONObject(updated.toString());
            }
        }, () -> {
            JSONArray confirmed = data.optJSONArray("availabilitySyncResults");
            if (confirmed != null && confirmed.length() > 0) showAvailabilityResults(confirmed);
            else { message=data.optJSONArray("queue").length()==0 ? "Alle reacties door kantoor ontvangen." : "Controleer de resterende conflicten."; showQueue(); }
        });
    }
    private static int syncPriority(String kind) { return "site_receipt".equals(kind) ? 2 : "evidence".equals(kind) ? 1 : 0; }
    private void retainSafetyMeeting(JSONObject source, String jobId, JSONObject confirmed) throws Exception {
        if (confirmed == null) return;
        JSONArray packs = source.optJSONArray("packs"); if (packs == null) return;
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i);
            if (!jobId.equals(pack.optJSONObject("job").optString("id"))) continue;
            JSONArray meetings = pack.optJSONArray("safetyMeetings"); if (meetings == null) return;
            for (int j = 0; j < meetings.length(); j++) if (confirmed.optString("id").equals(meetings.getJSONObject(j).optString("id"))) {
                confirmed.remove("pendingLocalAcknowledgement"); meetings.put(j, confirmed); return;
            }
            meetings.put(confirmed); return;
        }
    }
    private void markSafetyBriefingConflict(JSONObject source, String jobId, String meetingId) throws Exception {
        JSONArray packs = source.optJSONArray("packs"); if (packs == null) return;
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i); if (!jobId.equals(pack.optJSONObject("job").optString("id"))) continue;
            JSONArray meetings = pack.optJSONArray("safetyMeetings"); if (meetings == null) return;
            for (int j = 0; j < meetings.length(); j++) {
                JSONObject meeting = meetings.getJSONObject(j);
                if (meetingId.equals(meeting.optString("id")) && meeting.optJSONObject("pendingLocalAcknowledgement") != null) {
                    meeting.getJSONObject("pendingLocalAcknowledgement").put("state", "conflict"); return;
                }
            }
        }
    }
    private void retainSiteIssue(JSONObject source, String jobId, String issueId, JSONObject confirmedIssue) throws Exception {
        if (confirmedIssue == null) return;
        JSONArray packs = source.optJSONArray("packs"); if (packs == null) return;
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.optJSONObject(i);
            if (pack == null || !jobId.equals(pack.optJSONObject("job").optString("id"))) continue;
            JSONObject have = pack.optJSONObject("have"); JSONArray issues = have == null ? null : have.optJSONArray("siteIssues");
            for (int j = 0; issues != null && j < issues.length(); j++) {
                if (issueId.equals(issues.optJSONObject(j).optString("id"))) { issues.put(j, confirmedIssue); return; }
            }
            if (have != null && issues != null) issues.put(confirmedIssue);
            return;
        }
    }
    private void retainSyncedQuestion(JSONObject source, String jobId, JSONObject question) throws Exception {
        if (question == null) return;
        JSONArray packs = source.optJSONArray("packs"); if (packs == null) return;
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i);
            if (!jobId.equals(pack.optJSONObject("job").optString("id"))) continue;
            JSONArray questions = pack.optJSONArray("questions"); if (questions == null) questions = new JSONArray();
            String id = question.optString("id");
            for (int j = 0; j < questions.length(); j++) if (id.equals(questions.optJSONObject(j).optString("id"))) return;
            question.put("replyStatus", "open").put("response", JSONObject.NULL).put("repliedAt", JSONObject.NULL);
            JSONArray updated = new JSONArray().put(question);
            for (int j = 0; j < questions.length() && j < 19; j++) updated.put(questions.get(j));
            pack.put("questions", updated); return;
        }
    }
    private void markPhotoCaptured(JSONObject source, String jobId, String setId, String phase) throws Exception {
        JSONArray packs = source.optJSONArray("packs"); if (packs == null) return;
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i); if (!jobId.equals(pack.optJSONObject("job").optString("id"))) continue;
            JSONArray sets = pack.optJSONObject("checks").optJSONArray("photos"); if (sets == null) return;
            for (int j = 0; j < sets.length(); j++) {
                JSONObject set = sets.getJSONObject(j); if (!setId.equals(set.optString("id"))) continue;
                JSONArray captured = set.optJSONArray("capturedPhases"); if (captured == null) captured = new JSONArray();
                boolean exists = false; for (int k = 0; k < captured.length(); k++) if (phase.equals(captured.optString(k))) exists = true;
                if (!exists) captured.put(phase); set.put("capturedPhases", captured);
                JSONArray pending = set.optJSONArray("pendingPhotoPhases"), remaining = new JSONArray();
                if (pending != null) { boolean removed = false; for (int k = 0; k < pending.length(); k++) { String item = pending.optString(k); if (!removed && phase.equals(item)) removed = true; else remaining.put(item); } }
                set.put("pendingPhotoPhases", remaining); return;
            }
        }
    }
    private void openPdf(JSONObject file) {
        work(() -> {
            if (data.getLong("expiresAt") <= System.currentTimeMillis()) throw new IOException("Offline toegang verlopen.");
            closePdf(); byte[] bytes=android.util.Base64.decode(file.getString("base64"), android.util.Base64.DEFAULT);
            if (!FieldStore.sha(bytes).equals(file.getString("sha256"))) throw new IOException("Opgeslagen PDF is beschadigd.");
            pdfFile=File.createTempFile("drawing-", ".pdf", getCacheDir());
            try (OutputStream output=new FileOutputStream(pdfFile)) { output.write(bytes); }
            try {
                pdfDescriptor=ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY);
                // Keep only an open descriptor, even if the PDF parser rejects the file.
                if (!pdfFile.delete()) throw new IOException("Tijdelijk PDF-bestand kon niet worden afgeschermd.");
                pdf=new PdfRenderer(pdfDescriptor); pdfPage=0; pdfScale=1;
                if (pdf.getPageCount() < 1) throw new IOException("Deze PDF bevat geen pagina's.");
            } catch (Exception error) { closePdf(); throw error; }
        }, this::showPdf);
    }
    private void showPdf() {
        if (data.optLong("expiresAt") <= System.currentTimeMillis()) { showJobs(); return; }
        page("Tekening | pagina " + (pdfPage+1) + " / " + pdf.getPageCount());
        try (PdfRenderer.Page page=pdf.openPage(pdfPage)) {
            if (bitmap != null) bitmap.recycle();
            int width=Math.max(1, Math.min(2048, (int)(getResources().getDisplayMetrics().widthPixels*pdfScale))); int height=(int)Math.max(1, Math.min(4096L, (long)width*page.getHeight()/Math.max(1,page.getWidth())));
            bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888); bitmap.eraseColor(Color.WHITE); page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            HorizontalScrollView scroll=new HorizontalScrollView(this); ImageView image=new ImageView(this); image.setImageBitmap(bitmap); image.setContentDescription("Opgeslagen tekening pagina " + (pdfPage+1)); scroll.addView(image); content.addView(scroll);
        } catch (RuntimeException error) { message="Deze PDF kan niet worden weergegeven."; closePdf(); showPack(); return; }
        if (pdfPage>0) button("Vorige pagina", () -> { pdfPage--; showPdf(); });
        if (pdfPage+1<pdf.getPageCount()) button("Volgende pagina", () -> { pdfPage++; showPdf(); });
        button(pdfScale==1 ? "Inzoomen" : "Uitzoomen", () -> { pdfScale=pdfScale==1 ? 2 : 1; showPdf(); }); button("Terug naar opdracht", this::showPack);
    }
    private void closePdf() { if (pdf!=null) { pdf.close(); pdf=null; } try { if (pdfDescriptor!=null) pdfDescriptor.close(); } catch(IOException ignored) {} pdfDescriptor=null; if(pdfFile!=null) pdfFile.delete(); pdfFile=null; if(bitmap!=null) bitmap.recycle(); bitmap=null; }
    private void confirmErase() { new AlertDialog.Builder(this).setTitle("Werkmap verwijderen?").setMessage("Ook niet-verzonden reacties en tekeningen op deze telefoon worden verwijderd. Kantoorgegevens blijven behouden.").setNegativeButton("Annuleren",null).setPositiveButton("Verwijderen",(d,w) -> { store.erase(); data=null; currentScope=""; showLogin(); }).show(); }
    @Override public void onBackPressed() { if (busy) return; if (pdf!=null) showPack(); else if (data!=null) showJobs(); else super.onBackPressed(); }
    @Override protected void onResume() { super.onResume(); activityVisible = true; scheduleReplyRefresh(); }
    @Override protected void onPause() { activityVisible = false; replyHandler.removeCallbacks(refreshReplies); super.onPause(); }
    @Override protected void onDestroy() { super.onDestroy(); expiryHandler.removeCallbacks(checkExpiry); replyHandler.removeCallbacks(refreshReplies); store.token=""; executor.shutdownNow(); closePdf(); }
}
