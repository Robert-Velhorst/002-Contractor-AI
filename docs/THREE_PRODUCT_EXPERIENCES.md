# Contractor.AI: drie gezichten, een opdrachtdossier

Productrichting op basis van Roberts instructie van 4 september 2026.
Dit document onderscheidt de gewenste werking van de daadwerkelijk aanwezige
code. Het verklaart de hieronder beschreven nieuwe productketens niet voltooid.

## Kernbesluit

Contractor.AI is een samenwerking tussen aannemer, uitvoerende en klant.
Iedereen krijgt een eigen werkomgeving, maar afspraken, planning, bewijs en
besluiten komen uit hetzelfde gezaghebbende opdrachtdossier. Informatie wordt
eenmaal vastgelegd en vervolgens alleen gedeeld voor zover de ontvanger die
mag zien. Een andere weergave is geen andere waarheid.

## 1. De aannemer: overzicht en regie

Het bestaande dashboard blijft de besturingsomgeving. Het brengt aanvragen,
opname, calculatie, offerte, scope, planning, onderaannemers, inkoop, uitvoering,
veiligheid, kwaliteit, geldstromen, klantcontact, oplevering en nazorg samen.

De hoofdtaken zijn uitzonderingen beoordelen, besluiten nemen en vervolgwerk
uitzetten. Een klantvraag of veldmelding moet direct naar de oorspronkelijke
bron leiden, met de geraakte opdracht, voorgestelde actie, ontbrekende
informatie en gevolgen voor tijd en geld. Interne marges, personeelsgegevens,
leveranciersafspraken en conceptbesluiten zijn niet automatisch zichtbaar
voor klant of onderaannemer.

## 2. De uitvoerende: mijn opdracht op de telefoon

Een onderaannemer of medewerker ziet geen verkleind kantoordashboard, maar een
concreet werkpakket voor de toegewezen opdracht en de actuele revisie.

| Vraag | Benodigde inhoud en handeling |
| --- | --- |
| Wat moet ik kunnen? | Discipline, bevoegdheden, vereiste aantoonbare kwalificaties en ontbrekend/verlopen bewijs; geen automatische vakbekwaamheidsverklaring |
| Wat moet ik weten? | Adres, toegang, contactpersoon, scope en uitsluitingen, tekeningen/revisies, werkwijze, afhankelijkheden, risico's, instructies en klantafspraken die relevant zijn voor de uitvoering |
| Wat moet ik hebben? | Materialen, hoeveelheden, gereedschap, materieel, persoonlijke bescherming en vereiste documenten; ontvangst/aanwezigheid apart bevestigen |
| Wat moet ik doen? | Geordende taken, dagstart, startvoorwaarden, controlepunten, stopredenen, voortgang, uren, foto's, metingen, afwijkingen en eindedagoverdracht |
| Wat is veranderd? | Wijziging tegenover de eerder gelezen revisie, reden, verantwoordelijke en expliciete herbevestiging waar nodig |
| Waar loop ik vast? | Vraag, ontbrekend materiaal, onduidelijke tekening, onvoorziene toestand of onveilige situatie met bewijs en terugkoppeling |

Een startblokkade, gevaar of ontbrekende instructie blijft zichtbaar; een druk
op een knop of AI-samenvatting mag die niet opheffen. Een offline melding is
zichtbaar als lokaal bewaard en nog niet bevestigd door de server. Herhalen
van synchronisatie mag geen dubbele uren, foto's of opdrachten opleveren.

De eerste doelvorm is een installeerbare mobiele webapp op de bestaande
backend. Een native app is een afzonderlijke keuze als bewezen behoeften aan
achtergrondverwerking, apparaten of distributie dat rechtvaardigen. Het
onderscheid tussen werknemer en onderaannemer moet ook in rechten terugkomen:
een onderaannemer ziet zijn eigen werkpakket, niet standaard de hele opdracht
of de gegevens van andere uitvoerende bedrijven.

## 3. De klant: een doorlopend gesprek

De klant communiceert in een gesprek, zoals bij WhatsApp: vragen, antwoorden,
foto's, documenten, uitleg en voortgang bij elkaar. De klant hoeft niet te
weten hoe de interne projectadministratie is ingericht.

Eerst moet dit gesprek lokaal via een afgeschermde webomgeving volledig
werken. WhatsApp is daarna een mogelijke kanaaladapter, niet de database en
niet een voorwaarde om Contractor.AI lokaal te kunnen gebruiken. De adapter is
inmiddels gebouwd met ondertekende ontvangst en goedkeuringsgrenzen; een echte
Meta-accounttest en operatoracceptatie zijn nog niet uitgevoerd.

De gesprekservaring moet ondersteunen:

- Een tijdlijn van eigen berichten en voor deze klant vrijgegeven reacties.
- Foto's en bijlagen met serverautorisatie, type-/inhoudscontrole en een
  veilige weergave; geen publiek toegankelijke bewijsmap.
- Vragen over een specifieke foto, tekening, keuze of eerdere boodschap.
- Onderscheid tussen concept, lokaal bewaard, ontvangen, bezorgd en gelezen;
  status uitsluitend voor zover eigen systeem of provider die kan bewijzen.
- Expliciete keuzes en akkoordvragen die verwijzen naar exact dezelfde
  offerte-, wijzigings- of opleverversie als in de interne administratie.
- Een doorverwijzing naar een mens bij onduidelijkheid, klacht of conflict.

Een losse tekst zoals "prima" is zonder voldoende context geen opdracht om
een contract, prijs of uitvoeringsdatum aan te passen. De toepassing moet de
bedoelde beslissing en het relevante voorstel expliciet koppelen.

## AI: bron behouden, betekenis voorstellen, gecontroleerd verwerken

De gewenste informatieketen is:

`bericht/bijlage -> ontvangstregistratie -> analyse -> voorstel -> beoordeling -> dossierwijziging -> terugkoppeling`

1. Bewaar de ontvangen bron met kanaal, gesprek, afzender, opdracht, tijdstip,
   bericht-ID, eventuele verwijzing naar een vorig bericht en bestandshash.
   Een correctie vervangt de oorspronkelijke bron niet stilzwijgend.
2. Behandel berichttekst en documenten als gegevens, nooit als systeem-
   instructies. Een bijlage kan de toegangsrechten of beslisregels niet wijzigen.
3. Identificeer vragen, wensen, vermeende feiten, problemen, keuzes en mogelijke
   wijzigingen. Leg bronfragmenten, model-/regelversie, onzekerheid en
   tegenstrijdigheden vast. Ontbrekende informatie blijft onbekend.
4. Vergelijk met de bestaande scope, planning en eerdere afspraken. Koppel
   mogelijke tijd-/kostengevolgen aan de interne wijzigingsanalyse.
5. Maak concrete voorstellen: vervolgvraag, conceptantwoord, actie, inspectie,
   risicomelding of wijzigingsverzoek. Een AI-uitkomst is geen zelfstandig
   bewijs van veiligheid, uitvoering, betaling of klantacceptatie.
6. Laat alleen vastgestelde interne acties automatisch uitvoeren binnen de
   ingestelde rol- en beleidsgrenzen. Externe antwoorden, toezeggingen,
   bestellingen en financiele handelingen houden hun bestaande goedkeurings-
   en integratievoorwaarden.
7. Bewaar welk voorstel is aangenomen, aangepast of afgewezen en door wie.
   Herverwerking of een dubbel providerbericht mag geen dubbele actie geven.

"Nauwkeurig" betekent hier traceerbaar en toetsbaar, niet een belofte dat AI
nooit fouten maakt. Test onder andere Nederlandse spreektaal, ontkenningen,
bedragen, maten, datums, dubbelzinnige antwoorden, verschillende sprekers,
fotorevisies en tegenstrijdige berichten. Geen externe AI-verwerking zonder
expliciete provider-/privacyconfiguratie en gebruiksgrenzen. Een ingestelde
provider is niet hetzelfde als aangetoonde verwerkingskwaliteit.

## Wat de code nu daadwerkelijk biedt

Broninspectie bijgewerkt op 25 september 2026; onderstaande constateringen zijn geen
nieuwe end-to-end-acceptatie van alle bestaande onderdelen.

| Onderdeel | Bestaande basis | Nog nodig voor deze productrichting |
| --- | --- | --- |
| Aannemer | `App.jsx`, operating ledger, rollen, werkbank, interne dossiercontrole en wijzigingsanalyse; actuele klantbevindingen kunnen een toegewezen RFI met opvolgdatum worden | Een brede gezamenlijke conversatie-/uitzonderingenwachtrij met complete dekking van alle dossiers |
| Uitvoerende | Persoonlijk mobiel webwerkpakket, versleutelde offline momentopnames en goedgekeurde PDF-tekeningen, bewaarde vragen/leesbevestigingen, taakblokkades, veiligheidsdossier, werkvergunningen, LMRA en source-bound offline erkenning van toegewezen veiligheidsbriefings; expliciet aan een werkbordpositie gekoppelde taken, taakcontroles, taakgebonden tekeningen, materialen en actieve materieelreserveringen worden alleen aan de toegewezen uitvoerende getoond; een door kantoor goedgekeurd antwoord verschijnt in het werkpakket en als blijvende inboxmelding | APK-/apparaatacceptatie, volledige veiligheidsinstructies en offline documenttypen buiten goedgekeurde PDF-tekeningen, eigen onderaannemersgrenzen in alle bestaande schermen en echte telefoon-/offline-gebruikersacceptatie |
| Klant | Tokengebonden foto-/teksttijdlijn met antwoorden, paginering en alleen vrijgegeven kantoorreacties | Automatische import van oude tekstverzoeken, meer bijlagetypen en echte kanaalacceptatie |
| Klantberichten | Duurzame gesprek-ID's, reply-verwijzingen, deduplicatie en private bijlageketen onder `/api/client-portal/conversation` | Het oude `/api/client-portal/messages` blijft een afzonderlijke compatibiliteitsroute |
| AI-verwerking | Optionele lokale Ollama-analyse, gecontroleerde citaten, fotoverwijzingen, onzekerheid, brongekoppelde conceptantwoorden, interne RFI's en formele wijzigingsconcepten; automatische analyse gebruikt desgewenst een duurzame wachtrij met leases, bron-/configuratiecontrole en begrensde retries, zonder tweede kopie van klanttekst of foto's | Echt model operationeel accepteren, kwaliteitsmetingen, volledige gespreksoverstijgende analyse en verificatie van tijd-/kostengevolgen |
| Kanalen | WhatsApp-adapter met ondertekende ontvangst, goedgekeurde nummerbinding, expliciete verzending en bezorgstatussen | Live Meta-verificatie, operationele herstelprocedure voor onbekende uitkomsten en templates buiten het ingestelde 24-uursvenster |

## Bouwvolgorde en acceptatie

De eerste werkpakketstroom is gebouwd en gericht getest. Zie
[Mobiele werkpakketten](FIELD_WORK_PACK.md) voor de exacte huidige afbakening.
De [verbonden ervaringen](CONNECTED_EXPERIENCES.md) beschrijven de toegevoegde
offline-, gesprek-, analyse- en kanaalstromen en hun grenzen. Onderstaande bredere
acceptatie blijft gelden; lokale tests vervangen geen model- of provideracceptatie.

1. **Mobiel werkpakket:** eigenaar wijst een werkpakket toe; de juiste
   uitvoerende ziet de actuele instructies, vereisten, middelen en taken;
   een andere uitvoerende niet. Terugmeldingen verschijnen in hetzelfde dossier.
2. **Lokaal klantgesprek:** klant en kantoor wisselen tekst en gecontroleerde
   foto's uit; herstart, vervallen toegang, dubbele verzending, volgorde en
   mislukte uploads zijn afgedekt. Interne berichten lekken nooit naar de klant.
3. **Brongekoppelde analyse:** een klant vraagt een wijziging; het systeem
   koppelt de juiste opdracht en bron, vraagt ontbrekende informatie en maakt
   een beoordeelbaar voorstel met tijd-/kostengevolgen. Een tegenstrijdig
   bericht wordt zichtbaar, niet automatisch opgelost door een aanname.
4. **Doorwerking naar uitvoering:** na expliciet besluit krijgt de uitvoerende
   de juiste nieuwe werkpakketversie; de oude afspraak en erkenning blijven
   traceerbaar. Een goedgekeurd antwoord op een uitvoerdersvraag bereikt die
   uitvoerende via het werkpakket en de duurzame inbox. De klant krijgt alleen
   een vrijgegeven terugkoppeling.
5. **Externe kanalen:** pas na providerconfiguratie, autorisatie, privacykeuzes,
   kostenbegrenzing en echte ontvangst-/verzendtests een kanaal activeren.

Doorlopende releasevoorwaarden: lokale bruikbaarheid, blijvende EU-hostingroute,
rol- en opdrachtscheiding, versleutelde transportverbinding waar van toepassing,
herstelbaarheid, geen valse verzendclaims en geen automatisch akkoord op
consequentiele wijzigingen. De bredere [completion matrix](GOAL_COMPLETION_MATRIX.md)
blijft gelden; dit productmodel verkleint die scope niet.
