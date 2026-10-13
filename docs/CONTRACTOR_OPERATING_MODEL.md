# Contractor.AI: een samenhangend aannemersbedrijf in een tool

Ontwikkelrichting, bijgewerkt op 4 september 2026. Dit is een productmodel en
ontwikkelkaart, geen verklaring dat alle onderstaande processen volledig zijn
geautomatiseerd of juridisch zijn goedgekeurd.

## Uitgangspunt

De productrichting bestaat uit [drie gezichten](THREE_PRODUCT_EXPERIENCES.md):
de aannemer aan het stuur, de uitvoerende met een mobiel werkpakket en de klant
in een gesprek. Zij delen hetzelfde dossier met verschillende toegangsgrenzen.

Een aannemer verkoopt niet alleen uren. Het bedrijf moet passend werk aannemen,
de juiste scope en prijs vastleggen, risico's beheersen, mensen en middelen
organiseren, aantoonbaar goed uitvoeren, wijzigingen afspreken, betaald krijgen
en daarna verantwoordelijkheid voor het geleverde werk blijven dragen.

Contractor.AI moet dat proces verbinden rond hetzelfde projectdossier. Geen
losse AI-chat die opdrachten verzint, maar concrete registraties, controles,
besluiten en vervolgacties die naar hun bron terug te leiden zijn.

De software kan administratief en voorbereidend werk overnemen. Zij kan geen
fysieke opname, vakbekwaamheid, inspectie, klantacceptatie of bevoegd besluit
verzinnen. Onbekend betekent onbekend, niet automatisch in orde.

## Het werkveld

De tabel koppelt verantwoordelijkheden aan bestaande onderdelen. "Bestaand"
betekent dat er code en registraties voor zijn, niet dat elk bedrijfsscenario
of iedere externe koppeling al volledig is afgedekt.

| Verantwoordelijkheid | Wat in hetzelfde dossier thuishoort | Bestaande basis | Verdere uitwerking |
| --- | --- | --- | --- |
| Bedrijfsvoering | Identiteit, rollen, bevoegdheden, beleid, omzet/marge, herstelbaarheid | Organization, team access, audit, performance, backup | Meer begeleide inrichting per bedrijfstype en toetsing met echte aannemers |
| Acquisitie | Aanvraag, klant, locatie, geschiktheid, concurrentie, beschikbare capaciteit, bid/no-bid | Pipeline, market fit and bid decisions; dated crew demand is checked against current profiles, commitments, explicitly required approved qualifications, and exact matches to worker-declared skills. Expected supervision may be recorded separately by supervisor role, approved qualification, peak crew size, ratio and shift hours, then checked against that role's known daily capacity. Catalogue-material demand is compared with free stock and open-pipeline contention | Capacity remains advisory. Declared skills are not verified evidence; trade-role matching is exact text. Supervision peak/shift estimates do not resolve overlapping task windows or statutory rules. Home/site travel, dependencies and unregistered workers remain outside this acquisition check. On conversion, the source-fingerprinted crew forecast and supervisor qualification requirements carry into the job as a planning basis; no tasks or workers are assigned. Stock is a snapshot, not a reservation; supplier deliveries remain outside the check |
| Opname en haalbaarheid | Bereikbaarheid, maatvoering, foto's, bestaande toestand, onzekerheden, specialistische onderzoeken | Site surveys, evidence, risk registers | Gestructureerde opnameprofielen per discipline met bron en versie |
| Ontwerp en afstemming | Tekeningen, revisies, hoeveelheden, ontwerpvragen, goedgekeurde producten | Drawings, takeoff, RFI, submittals, transmittals | Een wijzigingsimpactoverzicht dat alle afhankelijke stukken terugvindt |
| Calculatie | Uren, materiaal, materieel, onderaanneming, risico, opslag, uitsluitingen | Estimate rates, WBS, budgets, commercial scope | Verifieerbare nacalculatie als voorstel voor toekomstige calculatie; geen stille prijsaanpassing |
| Contracteren | Scopeversie, offerte, voorwaarden, betaalmomenten, acceptatie, afspraken | Issue packages, approvals, delivery evidence, acceptance | Meer contractprofielen met specialistische validatie en toepassingsgrenzen |
| Regelgeving | Toepasselijkheid, bevoegd gezag, vergunningen/meldingen, kwaliteitsborging, termijnen | Permit reviews, compliance and evidence records | Expliciete landen- en projectprofielen met actuele bron, bevoegde beoordelaar en versie |
| Werkvoorbereiding | Afhankelijkheden, methoden, hoeveelheden, levermomenten, toegang, tekeningen | Work plans, capability setup, critical path, Last Planner | Overzicht van wijzigingsgevolgen voor planning, kosten, materiaal en klantafspraken |
| Personeel | Vakbekwaamheid, beschikbaarheid, rollen, ploegbezetting, instructies | Workforce, qualifications, capacity, assignments | Betere personeelsplanning over veel gelijktijdige projecten; geen automatische loonverwerking |
| Onderaannemers | Werkpakket, afspraken, bewijsstukken, beschikbaarheid, prestatie | Trade partners, procurement, qualification controls | Onderaannemersportaal en gecontroleerde koppelingen naar contract- en factuurstromen |
| Inkoop en logistiek | Bestellijsten, bestelgoedkeuring, levering, tekorten, retouren, voorraad | Procurement, receiving, inventory, loading, dispatch | Leverancierskoppelingen met ontvangstbewijzen en foutafhandeling |
| Materieel | Reservering, uitgifte, retour, schade, onderhoud, keuring | Equipment custody, maintenance/quarantine controls | Verdieping van langetermijnonderhoud en aantoonbare keuringshistorie |
| Bouwplaats en veiligheid | Dagstart, werkvergunning, LMRA/JHA, gevaar, stopwerk, incident, instructie | Field, pre-task plans, safety, site access | Praktijkacceptatie per werksoort; software mag een gevaarlijke situatie niet veilig verklaren |
| Uitvoering | Taken, voortgang, uren, verbruik, weersinvloed, foto's, dagrapport | Tasks, daily cycles, production, attendance, evidence | De planningsgereedheid koppelt weer aan de geplande start en markeert beoordelingen na 12 uur als verouderd; weersinvloed over de volledige werkperiode, praktijkacceptatie en verdere offline dekking blijven open |
| Kwaliteit | Controlepunten, meetwaarden, inspecties, afwijkingen, herstel | Inspection checklists, QC, NCR, punch | Een aantoonbare keten van ontwerpvereiste naar controle, bewijs en acceptatie |
| Meer- en minderwerk | Oorzaak, oorspronkelijke afspraak, bewijs, prijs- en tijdseffect, akkoord | Change orders, daywork, issue and acceptance chain | Impactvoorstellen die pas na akkoord de contractbasis wijzigen |
| Geldzaken | Budget, verplichtingen, werkelijke kosten, facturen, betaling, liquiditeit | Finance, invoice matching, milestones, receivables, cash flow | Geverifieerde boekhoud-/bankkoppelingen en boekhoudkundige acceptatie |
| Klantrelatie | Keuzes, vragen, communicatie, voortgang, klachten, akkoord | Client portal, selections, messages, feedback | Betere context per klantactie, nooit een verzendclaim zonder providerbewijs |
| Oplevering | Restpunten, revisiestukken, handleidingen, garanties, overdracht, acceptatie | Handover packages, closeout, punch | Afzonderlijke technische, contractuele en publiekrechtelijke afsluitmomenten |
| Nazorg | Melding, urgentie, oorzaak, herstel, garantiepositie, terugkerend onderhoud | Aftercare, warranty, recurring jobs | Serviceplanning die garantiewerk, betaald werk en terugkerende afspraken onderscheidt |
| Leren en sturen | Afwijkingen, faalkosten, voorspelbaarheid, prestaties, verbetervoorstellen | Learning profiles, frameworks, performance | Meetbare verbeterlussen gebaseerd op werkelijk vastgelegde uitkomsten |
| Privacy en continuiteit | Toegangsgrenzen, bewaarbeleid, export, herstel, incidenten | Role scoping, privacy requests, audit, backup/restore | Onafhankelijke herstel- en beveiligingsoefeningen voor de productieomgeving |

### Gedeelde materiaalvoorraad

De bedrijfsvoorraad is een bewijsgebonden telling. Vrije voorraad is de fysieke
telling minus actieve reserveringen voor concrete materiaalbehoeften op opdrachten.
Een kantooroperator reserveert alleen een gekoppelde hoeveelheid en eenheid; de
ledger weigert een reservering die de beschikbare voorraad overschrijdt. Een
reservering kan worden vrijgegeven of met een bewijsreferentie geheel of deels
worden verbruikt. De acties blijven in de audit- en mutatiehistorie staan.

Materiaal dat al op de bouwplaats is geteld, blijft een afzonderlijke
opdrachtstatus en wordt niet automatisch bij de magazijnvoorraad opgeteld. Een
ontvangst verhoogt de bedrijfsvoorraad alleen wanneer de operator expliciet het
bedrijfsmagazijn en de opslaglocatie kiest. Alleen geaccepteerde hoeveelheden met
een eenduidige cataloguskoppeling en gelijke eenheid tellen mee. Een goedgekeurde
ontvangstreversal wordt geblokkeerd als de voorraad daarvoor niet meer vrij
beschikbaar is. Deze stroom maakt geen bestelling, prijsafspraak, vervanging of
planningswijziging aan. Een kantooroperator kan een gereserveerde hoeveelheid
met transportreferentie, bewijs en verwachte aankomst aan de bouwplaats uitgeven.
Dat verlaagt de magazijnvoorraad en legt een ETA op de materiaalbehoefte vast,
maar telt nog niet als bouwplaatsvoorraad. De uitvoerende bevestigt in de
werkmap de ontvangen, geaccepteerde en beschadigde aantallen met locatie en
bewijs. Zonder verbinding kunnen die aankomsten in de versleutelde offline
werkmap worden bewaard; ze veranderen voorraad en planning pas nadat de
oorspronkelijke uitvoerder ze synchroniseert en de server de actuele uitgifte
heeft gecontroleerd. Alleen geaccepteerde aankomst verhoogt de
op-locatiebeschikbaarheid en kan een materiaalblokkade in de planning opheffen.
Elke deelontvangst is afzonderlijk en exact-replay-veilig. Locatievakken,
partijen en vervaldata, retourafhandeling en leverancierskoppelingen vallen
hier nog buiten.

## Samenhang: wat veroorzaakt vervolgwerk?

Deze ketens zijn acceptatiescenario's voor doorontwikkeling. Niet iedere
afhankelijkheid is al als uniforme, automatische impactregel aanwezig.

1. **Nieuwe aanvraag:** klant en locatie vastleggen, geschiktheid beoordelen,
   ontbrekende opnamegegevens signaleren, calculatie voorbereiden, offerte
   laten beoordelen. Een aanvraag is nog geen aangenomen opdracht.
2. **Geaccepteerde scope:** de overeengekomen versie koppelen aan budget,
   werkpakketten, capaciteit, materialen en mijlpalen. Een intern concept mag
   geen geaccepteerde overeenkomst vervangen.
3. **Tekening of klantkeuze wijzigt:** betrokken taken en materiaal bepalen,
   prijs/tijdeffect voorbereiden, ontbrekend akkoord zichtbaar maken. De
   oorspronkelijke baseline blijft beschikbaar.
4. **Medewerker valt uit of materiaal ontbreekt:** gereedheid opnieuw bepalen,
   geraakt werk signaleren, alternatieven voorbereiden. Niet automatisch een
   klantdatum wijzigen of een vervangende bestelling plaatsen.
5. **Afwijking of incident:** bewijs vastleggen, relevante controle/blokkade
   behouden, verantwoordelijke beoordeling vragen, herstel en hercontrole
   vastleggen. Een taak afvinken is geen bewijs van herstel.
6. **Werk gereed:** hoeveelheden en kosten vergelijken, resterende punten en
   dossierstukken controleren, passende factuur- en overdrachtsconcepten
   voorbereiden. Gereedmelden, klantacceptatie en betaald zijn blijven aparte
   feiten.
7. **Nazorgmelding:** koppelen aan het opgeleverde werk, urgentie beoordelen,
   garantie en bewijs laten beoordelen, herstelwerk plannen en uitkomst
   meenemen in verbeteranalyses.

Een blokkademelding uit de online of offline werkmap komt nu als bronregistratie
in **Verstoringen en herstel**. Zodra kantoor haar aan een herstelcasus koppelt,
volgt zij via de toegewezen verantwoordelijke in plaats van nogmaals als losse
blokkade. Bij annuleren komt een niet-opgeloste melding terug op de actieve
lijst; na afronden met herstelbewijs blijft de melding in de historie. Dit
wijzigt niet automatisch planning, bestelling, klantafspraak of veiligheidsstatus.
Voor een taakgebonden veldblokkade is vrije kantoorinvoer alleen niet voldoende
om de casus af te sluiten. De uitvoerende moet later op dezelfde taak een
`in uitvoering`-melding indienen. Die melding veroudert de open herstelcasus;
kantoor moet eerst de bijgewerkte bron beoordelen, daarna de specifieke melding
selecteren en herstelbewijs vastleggen. De koppeling bewaart taak, uitvoerende,
melding en bronhash. Historische afsluitingen van voor deze controle blijven
leesbaar als tekstueel herstelbewijs en worden niet achteraf als uitvoerder
geverifieerd aangemerkt.

Een herstelcasus kan bovendien niet meer worden afgesloten met alleen een vrije
notitie zolang de gekoppelde bronnen nog openstaan. Materiaaltekorten moeten in
de actuele ontvangstwaarde zijn opgeheven; veiligheidsmeldingen moeten via hun
eigen veiligheidsprocedure zijn gesloten; geraakte opdrachten tijdens
afwezigheid moeten zijn opgelost en de volledige lijst moet zijn beoordeeld.
Goedgekeurde klantafspraken vragen een actuele beoordeling zonder open
vervolgactie en actieve contractmijlpalen een actuele beoordeling zonder open
risico. Elke veldblokkade vereist daarnaast nog steeds de hervattingsmelding van
dezelfde uitvoerder op dezelfde taak. De afsluiting bewaart de gecontroleerde
bronversie, de uitgevoerde controles, actor en tijd in het auditspoor. Open
vervolgwerk blijft in de casus; er wordt geen klant- of leveranciersbericht,
datumwijziging, bestelling of veiligheidsvrijgave uitgevoerd.

Bij een gemelde afwezigheid toont dezelfde herstelcasus nu ook de geraakte
toewijzingen van die uitvoerder op andere opdrachten en de kandidaten die de
bestaande beschikbaarheids-, rol- en kwalificatiecontrole doorstaan. Kantoor kan
alle vervangingen als één portfolio-aanvraag ter onafhankelijke goedkeuring
indienen. De oorspronkelijke bezetting blijft staan tot goedkeuring; een
onvolledige conflictlijst blokkeert indienen. De aanvraag verandert geen
klantafspraak en verstuurt geen bericht.

Bij een vastgelegd tekort op een aan de levering gekoppelde bestelling kan
kantoor in dezelfde herstelcasus ook een leverancierscontactmoment registreren,
met bewijsreferentie en eventueel een door de leverancier genoemde datum of
vervolgcontactdatum. De bron- en casusversie worden gecontroleerd en dezelfde
opdrachtssleutel kan veilig opnieuw worden aangeboden. Dit registreert alleen
wat een medewerker meldt: het neemt geen contact op, plaatst geen bestelling,
wijzigt geen gevraagde leverdatum en markeert het tekort niet als opgelost.
Als een operator de leveranciersdatum met een bewijsreferentie expliciet aan de
materiaalbehoefte koppelt, vergelijkt de herstelweergave die verwachte datum per
gekoppelde taak met de start in de actuele goedgekeurde basisplanning. Een
verwachte aankomst na de taakstart wordt zichtbaar als risico; zonder actuele
basisplanning, geplande taakstart of vastgelegde datum blijft het resultaat
onbekend/niet vergelijkbaar. De vergelijking veroudert mee met bron en planning
en wijzigt geen planning, bestelling of klantbelofte.
Vanuit een afwijking kan kantoor direct de bestaande resource-preview openen.
Die gebruikt de geregistreerde beschikbaarheid, kwalificaties, materialen,
afhankelijkheden en beschermde bestaande tijdvakken om een intern voorstel of
een blokkade te tonen. De preview schrijft niets weg; een eventuele nieuwe
planning blijft een afzonderlijk brongebonden besluit- en goedkeuringspad.
Als een materiaalbehoefte geen geverifieerde beschikbaarheid heeft, houdt de
preview die gekoppelde taak en al het afhankelijke vervolgwerk expliciet buiten
het voorstel. Onafhankelijk werk kan wel als gedeeltelijke herschikking worden
voorgesteld. Bestaande tijdvakken van vastgehouden taken blijven geblokkeerd
voor dezelfde uitvoerende. Na materiaalbewijs moet de planning opnieuw worden
berekend; alleen het onafhankelijke voorstel wordt door de aparte goedkeuring
toegepast.

Bij personeelsuitval toont diezelfde casus alleen klantafspraken waarvoor er
een goedgekeurd locatiebezoek bestaat, de afspraak aan de getroffen uitvoerder
is toegewezen en de afspraak binnen diens vastgelegde afwezigheidsperiode valt.
Kantoor kan per bezoek vastleggen dat het ongewijzigd blijft, dat klantafstemming
nodig is of dat een antwoord wordt afgewacht, steeds met een referentie en waar
nodig een volgende controledatum. Een interne plandatum telt niet als
klantbelofte. Deze beoordeling verstuurt geen bericht en verplaatst het bezoek
niet; een voorstel of bevestiging van een nieuwe datum vereist een afzonderlijk
vastgelegd klantbesluit.

De beoordeling wordt nu gekoppeld aan een echt inkomend bericht uit de
goedgekeurde klanttoegang voor die opdracht. Het platform controleert de
toegangsstatus, bericht-richting, opdrachtkoppeling en actuele bronhash; de
bericht-hash en een begrensd tekstfragment blijven in het bewijs bewaard.
Nieuwe berichten maken een open beoordeling verouderd totdat kantoor de bron
opnieuw bekijkt. Een zelf ingevoerde tekstverwijzing geldt niet langer als bewijs
van een klantbericht. Contractuele opleverdatums worden apart vastgelegd en
worden niet uit chat of interne planning afgeleid.

De financiële/commerciële opdrachtsectie bevat nu wel een apart register voor
contractuele klantdatums. Een kantoorrol kan daar een startdatum, contractuele
mijlpaal of uiterste opleverdatum koppelen aan een huidige, goedgekeurde
acceptatie van een offerte of formeel geaccepteerde wijziging. De gebruiker
legt zelf de exacte contractpassage en document-/paginaverwijzing vast; de
software presenteert dit niet als juridisch gecontroleerd. Iedere revisie en
intrekking blijft in de auditgeschiedenis. De gewone streefdatum, planning,
AI-analyse en chat leveren geen contractdatum op. Bestaande herstelcasussen
nemen de huidige contractdatums als bronversie mee en vereisen herbeoordeling
als dat register wijzigt. Er wordt geen plandatum aangepast of bericht verstuurd.

Per open herstelcasus kan kantoor nu bovendien een impactbeoordeling aan een
specifieke contractmijlpaal koppelen: niet geraakt, risico of besluit nodig.
Een risico- of besluitstatus vereist een concrete controledatum. De registratie
bewaart de contractrevisie en de gekoppelde verstoringsbronnen; een nieuwe
contract- of bronversie maakt de beoordeling historisch en vraagt om een nieuwe
beoordeling. Dit is geen juridische uitleg, nieuwe klanttoezegging of
automatische wijziging van datum, planning of communicatie.

Dezelfde herstelcasus kan ook een kostenimpact vastleggen als interne raming,
onderbouwde nulimpact of nog onbekende kosten met een concrete controledatum.
Bedragen worden in eurocenten bewaard naast de toelichting, bewijsreferentie,
bronversie en auditregistratie. Een onbekende kostenimpact komt op de dagelijkse
opvolglijst zolang die beoordeling openstaat. Dit registreert geen werkelijke
kosten, boeking, factuur, betaling of klanttoezegging; gewijzigde bronnen maken
de beoordeling historisch en vereisen een nieuwe beoordeling.

Een herstelcasus kan daarnaast een deel van een bestaande, goedgekeurde EUR-
onkostendeclaratie of leveranciersfactuur aan de verstoring toerekenen. Alleen
bedragen die de kostenprognose al als goedgekeurde werkelijke kosten herkent,
zijn beschikbaar; de som over herstelcasussen kan nooit boven de bronpost komen.
De toerekening bewaart bronvingerafdruk, bedrag, reden en auditbewijs. Een
correctie draait uitsluitend de toerekening terug en maakt de ruimte opnieuw
beschikbaar; zij wijzigt de factuur, declaratie of financiële boekhouding niet.
Niet-EUR-bronnen blijven buiten deze verdeling zolang geen gecontroleerde
valutaomrekening beschikbaar is. Als ook een actuele raming bestaat, toont de
casus het verschil met de goedgekeurde en toegerekende kosten tot nu toe.
Teruggedraaide of niet langer actueel goedgekeurde bronnen tellen niet mee; dit
is nadrukkelijk geen eindafrekening.

Een herstelbron toont nu ook een planningssignaal. Alleen een actuele,
goedgekeurde planningsbasis mag met vastgelegde contractmijlpalen worden
vergeleken. Waar de bron aan taken is gekoppeld, worden geraakte taken,
kritieke-pad-overlap en beschikbare speling getoond. Ontbreekt een koppeling of
is de basisplanning verouderd, dan blijft het effect expliciet niet
vergelijkbaar. De vergelijking voorspelt geen vertraging, rekent geen
herstelplanning door en verandert geen contractdatum. Planningsversies en dit
signaal zijn onderdeel van de herstelbronfingerprint; een wijziging vereist
dus herbeoordeling.

## Deze bouwstap: dagelijkse werkbank

De pagina Today/Vandaag bevat nu een werkbank boven de planning. Ze hergebruikt
`buildTodayCommandPlan`, de bestaande gereedheidscontroles, goedkeuringswachtrij,
`nextActions` en capability-plannen. Er is geen tweede administratie toegevoegd.

- Filter werkgebied en beslissoort samen; zoek vervolgens binnen de opgebouwde
  commandolijst. De server filtert voordat hij een pagina van 20 acties levert.
- Bekijk hoge prioriteiten, uitvoerbare interne concepten, goedkeuringsvragen
  en blokkades binnen het filter. Deze aantallen kunnen overlappen.
- Open het betreffende project of goedkeuringsverzoek. Organisatiebrede acties
  openen het bijbehorende werkgebied, voor zover de rol dat mag zien.
- Als eigenaar: laat een geselecteerd intern concept voorbereiden. De server
  beoordeelt de actie opnieuw; blokkades en niet meer beschikbare acties worden
  overgeslagen. Het resultaat en de auditregistratie blijven in het ledger.
- De bestaande noodstop en serverautorisatie blijven van kracht. Medewerkers
  op locatie houden hun toegewezen werkweergave; zij krijgen deze brede
  bedrijfswachtrij niet te zien.

### Grenzen van deze werkbank

Het is een begrensde actuele actielijst, geen volledige bedrijfsaudit. Standaard
worden 12 dossiers verdiepend op gereedheid en ontbrekende inrichting bekeken.
De bestaande bronselectie gebruikt maximaal 500 recente dossiers, de
goedkeuringsbron maximaal 50 open verzoeken en andere monitors hun bestaande
limieten. De interface vermeldt het aantal meegenomen en in aanmerking komende
dossiers. Ook een lege lijst bewijst dus niet dat al het bedrijfswerk gereed is.

Paginering is stabiel bij ongewijzigde gegevens, maar geen bevroren snapshot;
nieuwe registraties kunnen prioriteiten en pagina's veranderen. Een klik om
een concept voor te bereiden selecteert bestaand regelwerk, niet een vrije
AI-opdracht. De bestaande applier kan meerdere interne records voor dezelfde
werksoort binnen het geselecteerde project voorbereiden; het resultaat vermeldt
het werkelijk gerapporteerde aantal. Sommige specialistische bronmeldingen
zijn nog Engels, ook bij de Nederlandse interface.

## Vervolgvolgorde

De eerste implementatie van de onderstaande stappen 1 en 2 is nu aanwezig in
`contractor-review.js` en **Vandaag -> Dossiercontrole**: hervatbare rondes over
alle dossier-ID's, een versiegebonden dekkingsmanifest per dossier, gepagineerde
dossierkeuze en een brongebonden tijd-/kostenanalyse bij gewijzigde taakduur.
Manifest v1 registreert 15 volledige job-brontabellen met rijtellingen, zeven
afgeleide bronsets en tien uitgevoerde controles. Een ronde is alleen volledig
als ieder dossier binnen dezelfde dossierinventaris is beoordeeld, ieder manifest
compleet is en geen controle is mislukt. Oudere lopende rondes zonder het actuele
manifest beginnen opnieuw; bevindingen blijven afzonderlijk menselijke
opvolgpunten. Dit is geen volledige bedrijfs- of veiligheidscertificering en
vervangt de limieten van andere monitors niet. De analyse vergelijkt
nu ook actieve, actuele contractuele `opleveren uiterlijk`-afspraken met de
huidige en voorgestelde planningsdatum; contractbronrevisies maken een bewaarde
analyse verouderd. Een voorgestelde hoeveelheid op een bestaande calculatieregel
wordt met de huidige kostprijs en verkoopprijs doorgerekend; de hoeveelhedenstaat
blijft ongewijzigd en een latere bronwijziging veroudert de analyse. Verschillende
valuta's worden niet bij elkaar opgeteld. Analyses wijzigen geen overeenkomsten,
calculaties of planning. De
datumvergelijking gebruikt kalenderdagen en de vastgelegde einddatum, niet een
werkrooster of juridische interpretatie. Andere mijlpaaltypen en afspraken
zonder actuele geaccepteerde bron worden niet als voorspelling gepresenteerd.
Alle overige monitors behouden voorlopig hun eigen limieten;
tekening-/hoeveelheidsinterpretatie en automatische contractdoorwerking zijn
hiermee niet voltooid. De verdere productvolgorde wordt gestuurd door het
drie-gezichtenmodel hierboven.

1. **Dekking verder opschalen:** manifest v1 en hervatbare volledige
   dossierinventaris zijn aanwezig, inclusief oudere opdrachten buiten de oude
   500-selectie. Nog nodig is bron-voor-bron cursorpaginering voor zeer grote
   registers, expliciete dekking van alle overige ledgerdomeinen en een
   periodieke sweep met operatorzichtbare ouderdom van elk bewijs. Geen
   "alles groen" zonder bewijs.
2. **Wijzigingsimpact verbinden:** duursscenario's, huidige calculatieregels,
   actuele contractuele opleverdatums, expliciete taakafhankelijkheden,
   goedgekeurde scopeversies en klantbesluiten zijn nu samen zichtbaar in de
   brongebonden analyse. Een opgelost klantbesluit veroudert een eerder
   bewaarde analyse en kan de goedgekeurde scopebron verouderd maken; een open
   klantvraag doet dat niet. Een kantooroperator kan een klantbesluit expliciet
   koppelen aan actieve taken of materiaalbehoeften, met reden en auditspoor;
   de impactanalyse toont alleen de gekoppelde besluiten die door het scenario
   worden geraakt. Deze koppelingen zijn beoordeelde relaties, geen automatische
   scope-, hoeveelheid-, planning- of bestelwijzigingen. Als een orderregel
   expliciet naar dezelfde materiaalbehoefte verwijst, toont de analyse nu ook
   leverancier, orderstatus, ontvangst, acceptatie en open hoeveelheid. Alleen
   werkelijk extern geplaatste orders tellen mee als aanvoer; ontvangstregels
   horen bij de bronvingerafdruk, zodat gewijzigde leveringen oud advies
   verouderen. Besluiten kunnen nu ook expliciet aan geverifieerde calculatieregels
   en actuele, integere tekeningrevisies worden gekoppeld. Een impactscenario kan
   een exact gekoppelde calculatieregel doorrekenen en een gecontroleerde
   tekeningvervanging als voorstel tonen. Alleen een geverifieerde huidige revisie
   is koppelbaar; de vervanger moet dezelfde tekening betreffen, actueel zijn als
   voorstel en op interne goedkeuring wachten. Goedkeuring verandert de bronhash
   en maakt eerder advies verouderd. De analyse publiceert de revisie niet en
   wijzigt geen hoeveelheden, scope, planning of bestelling.
3. **Dossierafsluiting verdiepen:** afzonderlijke bewijssets voor fysieke
   uitvoering, klantacceptatie, financiele afwikkeling en toepasselijke
   publieke meldingen; geen generieke juridische vrijgaveknop.
4. **Praktijkworkflows per bedrijfstype:** verbouw, onderhoud, installatie,
   dakwerk en buitenwerk testen met eigenaar, kantoor en buitendienst; meet
   invoertijd, dubbel werk, foutkans en ontbrekende gegevens.
5. **Providerkoppelingen:** pas aansluiten na configuratie, contractuele
   afspraken, rollen, ontvangstbewijs, idempotentie en fout-/hersteltests.
   AI mag voorstellen doen; beslisgrenzen blijven in de server.

Voor elke stap: model en API, rolgrenzen, werkende schermroute, migratie indien
nodig, tests en duidelijke bron-/bewijsstatus. De bestaande
[completion matrix](GOAL_COMPLETION_MATRIX.md) blijft de bredere
opleveradministratie. Dit document verklaart die scope niet voltooid.

### Materiaalhoeveelheden in wijzigingsanalyse

Een wijzigingsscenario kan naast hoeveelheden uit de hoeveelhedenstaat ook een
voorgestelde totale hoeveelheid voor een bestaande materiaalbehoefte bevatten.
De analyse vergelijkt dit met geaccepteerde beschikbare voorraad en nog niet
ontvangen hoeveelheden uit daadwerkelijk geplaatste inkooporders waarvan de
orderregel expliciet hetzelfde materiaalbehoefte-ID bevat. Actieve werkstappen
worden uitsluitend getoond als hun
`materialRequirementIds` de behoefte expliciet bevatten. Het resultaat meldt
huidig en voorgesteld ongedekt tekort, benodigde datum, leverancier en
werkstappen. Een hoger tekort dan door voorraad en geplaatste orders wordt
gemeld als extra levering die bevestigd moet worden voordat het gekoppelde werk
kan doorgaan. Dit is een brongebonden, niet-muterende simulatie: het wijzigt de
materiaalbehoefte, planning of inkoop niet en voegt materiaal niet toe aan de
financiële calculatie. Niet-geplaatste orders, niet expliciet gekoppelde
orderregels, alternatieve eenheden, snijverlies en levertijdprognoses worden
niet geraden en vereisen afzonderlijke beoordeling.

### Materiaaltekort en herstel

Een niet-afgedekte materiaalbehoefte wordt ook als herstelbron getoond voordat
een ontvangst is geboekt. Alleen geaccepteerde voorraad en resterende
hoeveelheden van daadwerkelijk uitgegeven inkooporders tellen mee wanneer de
orderregel expliciet naar dezelfde behoefte verwijst. Een conceptorder is geen
bewijs van levering. Gekoppelde actieve taken blijven zichtbaar en een open
tekort blokkeert afsluiting totdat nieuw bewijs het tekort opheft en een
medewerker de bron opnieuw beoordeelt. Leverancierscontact kan met
bewijsreferentie en opvolgdatum worden geregistreerd; de notitie verstuurt geen
bericht, plaatst geen bestelling en wijzigt de planning niet.

### Materiaalraming bij een nieuwe kans

Een kans kan materiaalbehoefte vastleggen met een exact ID uit de gedeelde
catalogus, de cataloguseenheid en een positieve hoeveelheid. De beoordeling
vergelijkt dit met getelde magazijnvoorraad minus actieve reserveringen. Ze
toont daarnaast dezelfde materiaalvraag uit andere open, nog niet omgezette
kansen, zodat dubbele aanspraak zichtbaar blijft. Een tekort tegen de huidige
voorraad en een tekort door concurrerende pijplijnvragen zijn afzonderlijke
uitkomsten. Onbekende artikelen en eenheidverschillen blijven onbekend.

Dit is uitsluitend een momentopname voor acquisitie: verwachte leveringen
tellen niet mee, een kans reserveert niets en er wordt geen bestelling gemaakt.
Een voorraad- of pijplijnwijziging maakt een eerder goedgekeurde bid/no-bid-
beslissing verouderd. Bij omzetting worden de exacte ID's, eenheden en
hoeveelheden atomair als opdrachtmateriaalbehoeften vastgelegd. Opnieuw proberen
maakt geen tweede opdracht of behoefte. Als een catalogus-ID of eenheid niet
meer exact bestaat, mislukt de omzetting zonder gedeeltelijke opdracht; eerst is
cataloguscorrectie nodig. Dit reserveert geen voorraad. De omgezette kans telt
dan niet meer mee als concurrente pijplijnvraag.

### Kwalificaties in capaciteitsramingen

Een vakrol in een acquisitieraming kan concrete vereiste kwalificaties uit de
bedrijfscatalogus vastleggen. Alleen actuele, goedgekeurde en integriteits-
gecontroleerde bewijsstukken tellen mee voor die uren; ontbrekende, wachtende,
verlopen of ongeldige bewijzen tellen niet als gekwalificeerde capaciteit. De
beoordeling blijft gekoppeld aan de vastgelegde periode en bewijsversies, zodat
een wijziging een eerdere bid/no-bid-beslissing veroudert.

Bij omzetting worden dezelfde eisen atomair aan de opdracht gekoppeld per vakrol.
Daarmee gebruiken bestaande plaatsings-, toegang- en startcontroles dezelfde
vereisten. Het systeem verifieert geen diploma of certificaat zelf, leidt geen
vakbekwaamheid af uit vrije vaardigheidstekst en neemt geen personen aan of toe
aan een opdracht. De aannemer moet per werkpakket de toepasselijke eisen
vaststellen; een acquisitieraming is geen juridische of veiligheidsverklaring.

## Nederlandse bronbasis en ontwerpgevolgen

KVK beschrijft de keten van offerte naar opdracht, uitvoering, facturering en
betaling. Het ontwerp houdt die stappen en hun verschillende bewijsstukken
gescheiden. Bron geraadpleegd op 4 september 2026:
[KVK: Van offerte naar geld op je rekening](https://www.kvk.nl/geldzaken/van-offerte-naar-geld-op-je-rekening/).

IPLO onderscheidt voor de toepasselijke technische bouwactiviteiten bouwmelding,
kwaliteitsborging en gereedmelding. Het dossier bevoegd gezag bevat andere
informatie dan alleen een klantenoverdracht. IPLO merkt bovendien op dat
"Bbl-klaar" niet hetzelfde is als volledig afgewerkt. Daarom mag Contractor.AI
contractuele oplevering, technische dossiercontrole en publiekrechtelijke
status niet samenvoegen tot een automatisch akkoord. Toepasselijkheid en
actuele vereisten moeten per project door een bevoegde persoon worden beoordeeld.
Bron geraadpleegd op 4 september 2026:
[IPLO: Bouwmelding en gereedmelding](https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/plichten/melding-bouwactiviteit/).

### Historische leveranciersdoorlooptijd

De leveranciersscore gebruikt alleen aantoonbaar uitgegeven bestellingen met
een volledig geaccepteerde ontvangst om de P75-doorlooptijd van uitgifte tot
complete ontvangst te tonen. Met minimaal drie zulke bestellingen wordt een
open uitgegeven bestelling met gevraagde leverdatum vergeleken met die
historische indicatie. Dit is een bedrijfseigen waarschuwingssignaal, geen
leverbelofte of automatische voorspelling. Artikelspecifieke levertijd,
werkdagen, deelleveringen, transport, vervanging en toekomstige capaciteit
worden niet afgeleid. Het signaal past een order of planning niet aan en
verstuurt geen leveranciersbericht.
