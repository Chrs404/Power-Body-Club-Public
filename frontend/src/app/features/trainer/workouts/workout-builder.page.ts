import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonBackButton, IonSpinner, IonIcon,
  IonModal, IonReorder, IonReorderGroup, IonFooter,
  AlertController, ToastController, ItemReorderEventDetail,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, trashOutline, addCircleOutline, closeCircleOutline, saveOutline,
  linkOutline, unlinkOutline, arrowBackOutline, bookmarkOutline, closeOutline,
  checkmark, searchOutline, chevronDownOutline, chevronUpOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { ClientService } from '../../../core/services/client.service';
import {
  Exercise, ExerciseInput, MuscleGroup, MUSCLE_GROUPS, MUSCLE_GROUP_LABELS,
} from '../../../core/models/exercise.model';
import {
  ExerciseKind, Workout, WorkoutDayInput, WorkoutExerciseInput, WorkoutTemplate,
  ordinaPerGruppoMuscolare,
} from '../../../core/models/workout.model';

/** Una serie di una piramidale mentre la si compone. */
interface DraftSet {
  reps: string;
  suggestedWeight: number | null;
}

/**
 * Riga in costruzione: tiene anche il nome, per non rileggere il catalogo.
 *
 * uid e' un identificativo locale, non salvato: serve solo come chiave
 * stabile per @for. Con "track $index" Angular riusa i nodi per posizione
 * e non li riordina mai, il che rende impossibile il trascinamento.
 */
interface DraftExercise extends Omit<WorkoutExerciseInput, 'pyramidSets'> {
  uid: string;
  exerciseName: string;
  /** Solo per raggruppare la bozza in sezioni: non viene inviato al server. */
  muscleGroup: MuscleGroup;
  /** Superset: eseguito di fila con l'esercizio precedente. */
  linkedToPrevious: boolean;
  kind: ExerciseKind;
  /** Serie della piramidale; conservate anche tornando a "Normale", per non perderle. */
  pyramidSets: DraftSet[];
}

interface DraftDay {
  uid: string;
  label: string;
  exercises: DraftExercise[];
}

let contatoreUid = 0;
function nuovoUid(prefisso: string): string {
  contatoreUid += 1;
  return `${prefisso}-${contatoreUid}`;
}

@Component({
  selector: 'app-workout-builder',
  imports: [
    FormsModule, ReactiveFormsModule, DatePipe, NgTemplateOutlet,
    IonContent, IonHeader, IonToolbar, IonBackButton, IonSpinner, IonIcon,
    IonModal, IonReorder, IonReorderGroup, IonFooter,
  ],
  templateUrl: './workout-builder.page.html',
  styleUrl: './workout-builder.page.css',
})
export class WorkoutBuilderPage implements OnInit {
  private readonly workoutService = inject(WorkoutService);
  private readonly exerciseService = inject(ExerciseService);
  private readonly clientService = inject(ClientService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Schermo largo (computer): gli esercizi diventano una tabella da
   * compilare riga per riga e il catalogo resta aperto a fianco, senza
   * finestre che si aprono e si chiudono.
   */
  readonly largo = signal(false);
  /** Giorno mostrato: i giorni si scelgono con i chip, uno alla volta. */
  readonly giornoAttivo = signal(0);
  /** Righe aperte sul telefono per modificarne serie, ripetizioni e pesi. */
  readonly aperti = signal<Set<string>>(new Set());
  /** Dati della scheda (nome, date, note) aperti per la modifica, al passo 2. */
  readonly datiAperti = signal(false);
  /** Filtro del catalogo per gruppo muscolare; null = tutti. */
  readonly filtroGruppo = signal<MuscleGroup | null>(null);
  /** Creazione dal catalogo affiancato: l'esercizio nuovo va subito nel giorno. */
  private aggiuntaDiretta = false;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly clientName = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly days = signal<DraftDay[]>([]);
  readonly editingWorkoutId = signal<number | null>(null);

  // Selezione esercizio
  readonly pickerOpen = signal(false);

  /**
   * Esercizi scelti nel selettore, non ancora aggiunti al giorno.
   *
   * Si conservano gli oggetti completi, non solo gli id: durante la
   * selezione l'istruttore può passare dal catalogo raggruppato alla
   * ricerca, e quest'ultima sostituisce il contenuto di `catalog()`.
   * Se l'array tenesse solo gli id, un esercizio scelto prima della
   * ricerca non sarebbe più recuperabile al momento della conferma.
   *
   * L'ordine dell'array è l'ordine di selezione: è quello con cui gli
   * esercizi vengono poi aggiunti al giorno.
   */
  readonly selezione = signal<Exercise[]>([]);
  readonly catalog = signal<Exercise[]>([]);
  readonly catalogLoading = signal(false);
  catalogSearch = '';
  private targetDayIndex = 0;
  private catalogTimer?: ReturnType<typeof setTimeout>;

  readonly groupLabels = MUSCLE_GROUP_LABELS;

  /**
   * Catalogo diviso per gruppo muscolare, con i soli gruppi che hanno
   * esercizi. L'istruttore sa gia' quale gruppo sta cercando: mostrargli
   * subito tutti gli esercizi lo costringe a scorrere una lista lunga.
   */
  get catalogoRaggruppato(): { gruppo: MuscleGroup; esercizi: Exercise[] }[] {
    const mappa = new Map<MuscleGroup, Exercise[]>();
    for (const ex of this.catalog()) {
      const lista = mappa.get(ex.muscleGroup) ?? [];
      lista.push(ex);
      mappa.set(ex.muscleGroup, lista);
    }
    return MUSCLE_GROUPS
      .filter((g) => mappa.has(g))
      .map((gruppo) => ({ gruppo, esercizi: mappa.get(gruppo)! }));
  }

  /** Durante una ricerca il raggruppamento non aiuta: si mostra tutto. */
  get inRicerca(): boolean {
    return this.catalogSearch.trim().length > 0;
  }

  /**
   * Gruppo aperto nel selettore. Viene ricordato fra un'apertura e
   * l'altra: aggiungendo piu' esercizi dello stesso gruppo di fila,
   * si evita di riaprire ogni volta la stessa sezione.
   */
  readonly gruppoAperto = signal<MuscleGroup | null>(null);

  onGruppoChange(valore: string | string[] | null | undefined): void {
    const v = Array.isArray(valore) ? valore[0] : valore;
    this.gruppoAperto.set((v as MuscleGroup) ?? null);
  }

  name = '';
  startDate = new Date().toISOString().slice(0, 10);
  endDate = '';
  notes = '';

  private clientId = 0;

  /**
   * In modalita' modello non c'e' un cliente: si costruisce una scheda
   * rapida riutilizzabile. Cambiano solo destinazione del salvataggio
   * e alcuni campi (periodo di validita', che un modello non ha).
   */
  readonly modalitaModello = signal(false);
  readonly templateId = signal<number | null>(null);

  /**
   * Scheda nuova per un cliente: passo 1 dati e punto di partenza (vuota o
   * una scheda rapida, che si puo' poi modificare), passo 2 giorni ed
   * esercizi. Modifiche e schede rapide partono direttamente dal passo 2.
   */
  readonly passo = signal<1 | 2>(2);
  readonly schedeRapide = signal<WorkoutTemplate[]>([]);
  /** Scheda rapida da cui si e' partiti; null = scheda vuota. */
  readonly partenza = signal<number | null>(null);
  readonly caricandoPartenza = signal(false);

  /** Vero per una scheda nuova assegnata a un cliente (non modifica, non modello). */
  get nuovaPerCliente(): boolean {
    return !this.modalitaModello() && this.editingWorkoutId() === null;
  }

  get totalExercises(): number {
    return this.days().reduce((sum, day) => sum + day.exercises.length, 0);
  }

  /**
   * Getter e non computed(): i computed tracciano solo i signal, mentre
   * name, startDate e le altre proprieta' legate a ngModel sono valori
   * normali. Peggio ancora, il cortocircuito di && impedirebbe persino
   * la registrazione di days() come dipendenza quando il nome e' vuoto,
   * lasciando il pulsante disabilitato per sempre.
   * Un getter viene rivalutato a ogni ciclo di change detection.
   */
  get canSave(): boolean {
    return this.blockingReason === null;
  }

  /** Motivo per cui il salvataggio non e' ancora possibile. */
  get blockingReason(): string | null {
    if (this.name.trim().length < 2) {
      return 'Inserisci il nome della scheda.';
    }
    if (this.days().length === 0) {
      return 'Aggiungi almeno un giorno.';
    }
    if (this.totalExercises === 0) {
      return 'Aggiungi almeno un esercizio.';
    }
    for (const day of this.days()) {
      for (const ex of day.exercises) {
        if (ex.kind !== 'PYRAMID') continue;
        if (ex.pyramidSets.length < 2) {
          return `${ex.exerciseName}: una piramidale ha almeno 2 serie.`;
        }
        if (ex.pyramidSets.some((serie) => !String(serie.reps).trim())) {
          return `${ex.exerciseName}: indica le ripetizioni di ogni serie.`;
        }
      }
    }
    return null;
  }

  constructor() {
    const media = window.matchMedia('(min-width: 1100px)');
    this.largo.set(media.matches);
    const cambio = (e: MediaQueryListEvent) => this.largo.set(e.matches);
    media.addEventListener('change', cambio);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', cambio));

    addIcons({
      add, trashOutline, addCircleOutline, closeCircleOutline, saveOutline,
      linkOutline, unlinkOutline, arrowBackOutline, bookmarkOutline, closeOutline,
      checkmark, searchOutline, chevronDownOutline, chevronUpOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.paramMap;
    const clientIdParam = params.get('clientId');
    const workoutIdParam = params.get('workoutId');
    const templateIdParam = params.get('templateId');

    /*
     * Quattro percorsi possibili, distinti dal solo indirizzo:
     *
     *   schede/nuova/:clientId          nuova scheda per un cliente
     *   schede/:workoutId/modifica      modifica di una scheda esistente
     *   schede-rapide/nuova             nuovo modello
     *   schede-rapide/:templateId/modifica   modifica di un modello
     *
     * Prima la modifica passava da un parametro di query su una rotta
     * chiamata "nuova": un indirizzo ambiguo gia' a leggerlo, e che
     * bastava perdere per ritrovarsi in creazione senza accorgersene.
     */
    const modello = clientIdParam === null && workoutIdParam === null;
    this.modalitaModello.set(modello);

    try {
      if (modello) {
        this.clientName.set('Scheda rapida');
        if (templateIdParam) {
          await this.loadTemplateForEdit(Number(templateIdParam));
        } else {
          this.iniziaNuova();
        }
        return;
      }

      if (workoutIdParam) {
        await this.loadForEdit(Number(workoutIdParam));
        return;
      }

      this.clientId = Number(clientIdParam);
      await this.caricaNomeCliente();

      const oggi = new Date();
      const fine = new Date();
      fine.setDate(fine.getDate() + 28); // ciclo tipico di 4 settimane
      this.startDate = oggi.toISOString().slice(0, 10);
      this.endDate = fine.toISOString().slice(0, 10);

      /*
       * Arrivando da "Personalizza prima di assegnare", il costruttore
       * si apre con il contenuto del modello gia' dentro, ma come scheda
       * NUOVA per questo cliente: salvando si crea una copia sua, e il
       * modello originale resta intatto per gli altri.
       */
      const modelloParam = this.route.snapshot.queryParamMap.get('daModello');
      if (modelloParam) {
        await this.precompilaDaModello(Number(modelloParam));
        this.partenza.set(Number(modelloParam));
      } else {
        this.iniziaNuova();
        this.passo.set(1);
      }
      // Elenco per "Da dove parti": se non si carica, resta la scheda vuota.
      this.workoutService.listTemplates()
        .then((modelli) => this.schedeRapide.set(modelli))
        .catch(() => this.schedeRapide.set([]));
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(
        err?.error?.message ?? 'Impossibile caricare i dati. Torna indietro e riprova.'
      );
    } finally {
      this.loading.set(false);
      // Sul computer il catalogo e' sempre aperto a fianco degli esercizi.
      if (this.largo()) void this.loadCatalog();
    }
  }

  get testoSalva(): string {
    if (this.saving()) return 'Salvataggio…';
    if (this.modalitaModello()) return this.templateId() ? 'Salva modifiche' : 'Salva scheda rapida';
    return this.editingWorkoutId() ? 'Salva modifiche' : 'Crea e assegna';
  }

  /** Riga sopra il titolo: per chi e', e a che punto della creazione. */
  get occhiello(): string {
    if (this.modalitaModello()) return 'Scheda rapida';
    const passo = this.nuovaPerCliente ? ` · passo ${this.passo()} di 2` : '';
    return `${this.editingWorkoutId() ? 'Scheda di ' : 'Per '}${this.clientName()}${passo}`;
  }

  get titolo(): string {
    const nuova = this.modalitaModello() ? 'Nuova scheda rapida' : 'Nuova scheda';
    if (this.passo() === 1) return nuova;
    return this.name.trim() || nuova;
  }

  /** Giorno in cui finiranno gli esercizi scelti nella finestra di selezione. */
  get giornoDestinazione(): string {
    return this.days()[this.targetDayIndex]?.label || 'Giorno';
  }

  /**
   * Dove porta il pulsante indietro quando non c'e' cronologia:
   * alle schede del cliente su cui si sta lavorando, non a un elenco
   * generico da cui bisognerebbe ritrovarlo.
   */
  percorsoRitorno(): string {
    if (this.modalitaModello()) return '/istruttore/schede-rapide';
    return this.clientId ? `/istruttore/clienti/${this.clientId}` : '/istruttore/clienti';
  }

  // ------------------------------------------------------ passo 1: partenza

  /** Sceglie da dove partire: null = scheda vuota, altrimenti una scheda rapida. */
  async scegliPartenza(modelloId: number | null): Promise<void> {
    if (this.caricandoPartenza() || modelloId === this.partenza()) return;
    this.partenza.set(modelloId);

    if (modelloId === null) {
      this.iniziaNuova();
      return;
    }

    this.caricandoPartenza.set(true);
    try {
      await this.precompilaDaModello(modelloId, false);
    } finally {
      this.caricandoPartenza.set(false);
    }
  }

  continua(): void {
    if (this.name.trim().length < 2) {
      void this.showToast('Inserisci il nome della scheda (almeno 2 caratteri).', 'warning');
      return;
    }
    this.passo.set(2);
  }

  descriviModello(m: WorkoutTemplate): string {
    const esercizi = m.days.reduce((tot, d) => tot + d._count.exercises, 0);
    const giorni = m._count.days;
    return `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}, ${esercizi} esercizi`;
  }

  private iniziaNuova(): void {
    this.days.set([{ uid: nuovoUid('giorno'), label: 'Giorno A', exercises: [] }]);
    this.giornoAttivo.set(0);
  }

  private async caricaNomeCliente(): Promise<void> {
    const client = await this.clientService.getById(this.clientId);
    this.clientName.set(
      [client.firstName, client.lastName].filter(Boolean).join(' ') || client.username
    );
  }

  /**
   * Converte i giorni di una scheda salvata nelle righe in costruzione.
   * Condivisa fra la modifica di un modello e la precompilazione da
   * modello: e' la stessa struttura, e duplicarla significherebbe
   * doversi ricordare di aggiornarla in due punti.
   */
  private giorniInBozza(days: Workout['days']): DraftDay[] {
    return days.map((day) => ({
      uid: nuovoUid('giorno'),
      label: day.label,
      // Una scheda creata prima delle sezioni puo' avere i gruppi alternati:
      // aprendola viene gia' raccolta, e salvandola resta cosi'.
      exercises: this.sistemaGiorno(
        day.exercises.map((we) => ({
          uid: nuovoUid('esercizio'),
          linkedToPrevious: we.linkedToPrevious,
          exerciseId: we.exerciseId,
          exerciseName: we.exercise.name,
          muscleGroup: we.exercise.muscleGroup,
          sets: we.sets,
          reps: we.reps,
          restSeconds: we.restSeconds,
          suggestedWeight:
            we.suggestedWeight !== null ? Number(we.suggestedWeight) : null,
          notes: we.notes ?? undefined,
          kind: we.kind ?? 'NORMAL',
          pyramidSets: (we.pyramidSets ?? []).map((serie) => ({
            reps: serie.reps,
            suggestedWeight:
              serie.suggestedWeight !== null && serie.suggestedWeight !== ''
                ? Number(serie.suggestedWeight)
                : null,
          })),
        }))
      ),
    }));
  }

  private async loadTemplateForEdit(id: number): Promise<void> {
    const modello = await this.workoutService.getTemplate(id);
    this.templateId.set(modello.id);
    this.name = modello.name;
    this.notes = modello.notes ?? '';
    this.days.set(this.giorniInBozza(modello.days));
  }

  /**
   * Carica il contenuto di un modello in una scheda NUOVA per il cliente.
   *
   * A differenza di loadTemplateForEdit, non imposta templateId: cosi'
   * al salvataggio viene creata una scheda del cliente e non viene
   * modificato il modello di partenza, che resta utilizzabile per gli
   * altri.
   */
  private async precompilaDaModello(id: number, sovrascriviNome = true): Promise<void> {
    try {
      const modello = await this.workoutService.getTemplate(id);
      // Dal passo 1 il nome eventualmente gia' scritto resta.
      if (sovrascriviNome || !this.name.trim()) this.name = modello.name;
      this.notes = modello.notes ?? '';
      this.days.set(this.giorniInBozza(modello.days));
    } catch {
      // Il modello non e' raggiungibile: si parte comunque da una scheda
      // vuota, invece di bloccare del tutto la creazione.
      this.iniziaNuova();
      await this.showToast(
        'Impossibile caricare la scheda rapida: si parte da una scheda vuota.',
        'warning'
      );
    }
  }

  private async loadForEdit(workoutId: number): Promise<void> {
    const workout = await this.workoutService.getById(workoutId);
    this.editingWorkoutId.set(workout.id);

    // Il cliente arriva dalla scheda, non dall'indirizzo: non possono
    // divergere ed e' un parametro in meno da tenere allineato.
    this.clientId = workout.userId;
    await this.caricaNomeCliente();

    this.name = workout.name;
    this.startDate = workout.startDate.slice(0, 10);
    this.endDate = workout.endDate ? workout.endDate.slice(0, 10) : '';
    this.notes = workout.notes ?? '';
    this.days.set(this.giorniInBozza(workout.days));
  }

  addDay(): void {
    const current = this.days();
    // Lettere come nei mockup e nelle schede in palestra: Giorno A, B, C...
    const etichetta = current.length < 26
      ? `Giorno ${String.fromCharCode(65 + current.length)}`
      : `Giorno ${current.length + 1}`;
    this.days.set([
      ...current,
      { uid: nuovoUid('giorno'), label: etichetta, exercises: [] },
    ]);
    this.giornoAttivo.set(current.length);
  }

  async confirmRemoveDay(index: number): Promise<void> {
    const day = this.days()[index];
    if (day.exercises.length === 0) {
      this.removeDay(index);
      return;
    }

    const alert = await this.alertController.create({
      header: 'Rimuovere il giorno?',
      message: `"${day.label}" contiene ${day.exercises.length} esercizi.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: 'Rimuovi', role: 'destructive', handler: () => this.removeDay(index) },
      ],
    });
    await alert.present();
  }

  private removeDay(index: number): void {
    this.days.set(this.days().filter((_, i) => i !== index));
    this.giornoAttivo.set(Math.max(0, Math.min(this.giornoAttivo(), this.days().length - 1)));
  }

  updateDayLabel(index: number, label: string): void {
    const copy = [...this.days()];
    copy[index] = { ...copy[index], label };
    this.days.set(copy);
  }

  openPicker(dayIndex: number): void {
    this.targetDayIndex = dayIndex;
    this.catalogSearch = '';
    this.filtroGruppo.set(null);
    this.selezione.set([]);
    this.aggiuntaDiretta = false;
    this.pickerOpen.set(true);
    void this.loadCatalog();
  }

  // ------------------------------------------------------ giorni e righe

  get giornoCorrente(): DraftDay | null {
    return this.days()[this.giornoAttivo()] ?? this.days()[0] ?? null;
  }

  aperto(uid: string): boolean {
    return this.aperti().has(uid);
  }

  apriChiudi(uid: string): void {
    const aperti = new Set(this.aperti());
    if (aperti.has(uid)) {
      aperti.delete(uid);
    } else {
      aperti.add(uid);
    }
    this.aperti.set(aperti);
  }

  /** Riga di riepilogo sotto il nome: "4 × 8 · recupero 90 s · 60 kg". */
  riassunto(day: DraftDay, indice: number): string {
    const ex = day.exercises[indice];
    const peso = (kg: number | null | undefined) =>
      kg !== null && kg !== undefined ? `${parseFloat(Number(kg).toFixed(2)).toLocaleString('it-IT')} kg` : null;

    if (ex.kind === 'PYRAMID' && !this.inSuperset(day, indice)) {
      return [ex.pyramidSets.map((s) => s.reps).join('-'), `recupero ${ex.restSeconds ?? 60} s`].join(' · ');
    }
    if (this.inSuperset(day, indice)) {
      return [`${ex.reps} ripetizioni`, peso(ex.suggestedWeight)].filter(Boolean).join(' · ');
    }
    return [`${ex.sets} × ${ex.reps}`, `recupero ${ex.restSeconds ?? 60} s`, peso(ex.suggestedWeight)]
      .filter(Boolean)
      .join(' · ');
  }

  /** Ultima riga di un superset: chiude il blocco con giri e recupero comuni. */
  chiudeSuperset(day: DraftDay, indice: number): boolean {
    const blocco = this.blocchiDelGiorno(day).find((b) => b.indici.includes(indice));
    return !!blocco?.superset && blocco.indici[blocco.indici.length - 1] === indice;
  }

  infoSuperset(day: DraftDay, indice: number): string {
    const blocco = this.blocchiDelGiorno(day).find((b) => b.indici.includes(indice));
    const capo = blocco ? day.exercises[blocco.indici[0]] : day.exercises[indice];
    return `Superset ${blocco?.sigla ?? ''} · ${capo.sets} giri · recupero ${capo.restSeconds ?? 60} s`;
  }

  /** Scioglie tutto il superset a cui appartiene la riga. */
  sciogliSuperset(dayIndex: number, indice: number): void {
    const day = this.days()[dayIndex];
    const blocco = this.blocchiDelGiorno(day).find((b) => b.indici.includes(indice));
    if (!blocco) return;
    this.aggiornaBlocco(dayIndex, blocco.indici.slice(1), { linkedToPrevious: false });
    const copy = [...this.days()];
    copy[dayIndex] = { ...copy[dayIndex], exercises: this.sistemaGiorno(copy[dayIndex].exercises) };
    this.days.set(copy);
  }

  get totaleGiorni(): string {
    const g = this.days().length;
    const e = this.totalExercises;
    return `${g} ${g === 1 ? 'giorno' : 'giorni'} · ${e} ${e === 1 ? 'esercizio' : 'esercizi'}`;
  }

  // ------------------------------------------------------------- catalogo

  /** Gruppi presenti nel catalogo caricato, nell'ordine standard. */
  get gruppiCatalogo(): MuscleGroup[] {
    const presenti = new Set(this.catalog().map((e) => e.muscleGroup));
    return MUSCLE_GROUPS.filter((g) => presenti.has(g));
  }

  /** Catalogo filtrato per gruppo; durante una ricerca si mostra tutto il trovato. */
  get catalogoFiltrato(): Exercise[] {
    const gruppo = this.filtroGruppo();
    if (this.inRicerca || !gruppo) return this.catalog();
    return this.catalog().filter((e) => e.muscleGroup === gruppo);
  }

  scegliGruppo(gruppo: MuscleGroup | null): void {
    this.filtroGruppo.set(this.filtroGruppo() === gruppo ? null : gruppo);
  }

  /** L'esercizio e' gia' nel giorno mostrato (catalogo affiancato). */
  giaNelGiorno(exerciseId: number): boolean {
    return this.giornoCorrente?.exercises.some((e) => e.exerciseId === exerciseId) ?? false;
  }

  /** Catalogo affiancato: un tocco su "+" aggiunge subito l'esercizio al giorno mostrato. */
  aggiungiSubito(exercise: Exercise): void {
    this.targetDayIndex = this.giornoAttivo();
    this.selezione.set([exercise]);
    this.inserisciSelezione();
  }

  /** Sul computer "Nuovo esercizio" apre direttamente il modulo di creazione. */
  apriNuovoEsercizioDiretto(): void {
    this.targetDayIndex = this.giornoAttivo();
    this.selezione.set([]);
    this.aggiuntaDiretta = true;
    this.pickerOpen.set(true);
    this.apriCreazioneEsercizio();
  }

  /** Il catalogo affiancato si carica all'apertura della pagina sul computer. */
  caricaCatalogo(): void {
    void this.loadCatalog();
  }

  onCatalogSearch(): void {
    clearTimeout(this.catalogTimer);
    this.catalogTimer = setTimeout(() => void this.loadCatalog(), 300);
  }

  private async loadCatalog(): Promise<void> {
    this.catalogLoading.set(true);
    try {
      this.catalog.set(
        await this.exerciseService.list({
          search: this.catalogSearch.trim() || undefined,
        })
      );
    } catch {
      this.catalog.set([]);
    } finally {
      this.catalogLoading.set(false);
    }
  }

  /** Aggiunge o toglie un esercizio dalla selezione, senza chiudere il selettore. */
  toggleSelezione(exercise: Exercise): void {
    const attuale = this.selezione();
    const indice = attuale.findIndex((e) => e.id === exercise.id);

    this.selezione.set(
      indice >= 0
        ? attuale.filter((e) => e.id !== exercise.id)
        : [...attuale, exercise]
    );
  }

  /** Posizione (1, 2, 3...) nella selezione corrente; 0 se non selezionato. */
  posizioneSelezione(exerciseId: number): number {
    return this.selezione().findIndex((e) => e.id === exerciseId) + 1;
  }

  /** Svuota la selezione senza chiudere il selettore. */
  svuotaSelezione(): void {
    this.selezione.set([]);
  }

  /**
   * Aggiunge al giorno tutti gli esercizi scelti, nell'ordine esatto
   * in cui sono stati toccati.
   */
  confermaSelezione(): void {
    if (this.selezione().length === 0) return;
    this.inserisciSelezione();
    this.chiudiPicker();
  }

  /** Aggiunge in fondo al giorno di destinazione gli esercizi selezionati. */
  private inserisciSelezione(): void {
    const scelti = this.selezione();
    if (scelti.length === 0) return;

    const copy = [...this.days()];
    const day = copy[this.targetDayIndex];

    const nuoveRighe = scelti.map((exercise) => ({
      uid: nuovoUid('esercizio'),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      linkedToPrevious: false,
      sets: 3,
      reps: '10',
      restSeconds: 60,
      suggestedWeight: null,
      kind: 'NORMAL' as ExerciseKind,
      pyramidSets: [],
    }));

    // Ogni esercizio aggiunto finisce in fondo alla sezione del suo
    // gruppo muscolare, o apre una sezione nuova in fondo al giorno.
    copy[this.targetDayIndex] = {
      ...day,
      exercises: this.sistemaGiorno([...day.exercises, ...nuoveRighe]),
    };

    this.days.set(copy);
    this.selezione.set([]);
  }

  /**
   * Unico punto di chiusura del selettore, usato dal tasto Chiudi, dal
   * dismiss del backdrop e dalla conferma: garantisce che la selezione
   * non resti residua se il selettore viene riaperto per un altro giorno.
   */
  chiudiPicker(): void {
    this.pickerOpen.set(false);
    this.selezione.set([]);
    this.annullaCreazioneEsercizio();
  }

  // --------------------------------------------- creazione al volo

  /**
   * Se il catalogo non contiene l'esercizio cercato, l'istruttore può
   * crearlo senza uscire dal selettore né perdere la scheda in
   * costruzione. È lo stesso modulo della pagina Esercizi, semplificato
   * ai soli campi indispensabili: qui l'obiettivo è "esiste e si può
   * scegliere subito", non compilare una scheda completa — quella resta
   * disponibile in un secondo momento dalla gestione del catalogo.
   */
  readonly creandoEsercizio = signal(false);
  readonly salvandoEsercizio = signal(false);
  readonly erroreEsercizio = signal<string | null>(null);

  readonly muscleGroups = MUSCLE_GROUPS;

  readonly nuovoEsercizioForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    muscleGroup: ['CHEST' as MuscleGroup, Validators.required],
    description: [''],
    videoUrl: [''],
    imageUrl: [''],
  });

  /**
   * Il testo già digitato nella ricerca finisce quasi sempre per essere
   * il nome dell'esercizio che si sta per creare: pre-compilarlo evita
   * di doverlo ridigitare.
   */
  apriCreazioneEsercizio(): void {
    this.erroreEsercizio.set(null);
    this.nuovoEsercizioForm.reset({
      name: this.catalogSearch.trim(),
      // Il gruppo filtrato in quel momento e' il piu' probabile.
      muscleGroup: this.filtroGruppo() ?? 'CHEST',
      description: '',
      videoUrl: '',
      imageUrl: '',
    });
    this.creandoEsercizio.set(true);
  }

  annullaCreazioneEsercizio(): void {
    this.creandoEsercizio.set(false);
    this.erroreEsercizio.set(null);
    // Aperto solo per creare (catalogo affiancato): tornare indietro chiude.
    if (this.aggiuntaDiretta && this.pickerOpen()) {
      this.aggiuntaDiretta = false;
      this.pickerOpen.set(false);
    }
  }

  async salvaNuovoEsercizio(): Promise<void> {
    if (this.nuovoEsercizioForm.invalid || this.salvandoEsercizio()) {
      this.nuovoEsercizioForm.markAllAsTouched();
      return;
    }

    this.salvandoEsercizio.set(true);
    this.erroreEsercizio.set(null);

    const v = this.nuovoEsercizioForm.getRawValue();
    const payload: ExerciseInput = {
      name: v.name.trim(),
      muscleGroup: v.muscleGroup,
      description: v.description.trim() || undefined,
      videoUrl: v.videoUrl.trim() || undefined,
      imageUrl: v.imageUrl.trim() || undefined,
    };

    try {
      const creato = await this.exerciseService.create(payload);

      if (this.aggiuntaDiretta) {
        // Dal catalogo affiancato: niente selezione, va subito nel giorno.
        this.selezione.set([creato]);
        this.inserisciSelezione();
        this.catalogSearch = '';
        await this.loadCatalog();
        this.chiudiPicker();
        await this.showToast(`"${creato.name}" creato e aggiunto.`, 'success');
        return;
      }

      // Selezionato subito: l'ha creato apposta per aggiungerlo a questo
      // giorno, quindi un tocco in più per riselezionarlo sarebbe superfluo.
      this.selezione.set([...this.selezione(), creato]);

      // La ricerca viene svuotata: se conteneva un termine che non
      // corrisponde più esattamente al nome appena scelto, l'esercizio
      // nuovo resterebbe nascosto nell'elenco filtrato.
      this.catalogSearch = '';
      await this.loadCatalog();

      this.creandoEsercizio.set(false);
      await this.showToast(`"${creato.name}" creato e aggiunto alla selezione.`, 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const campo = err?.error?.fields ? Object.values(err.error.fields)[0] : undefined;
      this.erroreEsercizio.set(campo ?? err?.error?.message ?? 'Creazione non riuscita.');
    } finally {
      this.salvandoEsercizio.set(false);
    }
  }

  removeExercise(dayIndex: number, exerciseIndex: number): void {
    const copy = [...this.days()];
    copy[dayIndex] = {
      ...copy[dayIndex],
      exercises: this.sistemaGiorno(
        copy[dayIndex].exercises.filter((_, i) => i !== exerciseIndex)
      ),
    };
    this.days.set(copy);
  }

  updateExercise(
    dayIndex: number,
    exerciseIndex: number,
    patch: Partial<DraftExercise>
  ): void {
    const copy = [...this.days()];
    const exercises = [...copy[dayIndex].exercises];
    exercises[exerciseIndex] = { ...exercises[exerciseIndex], ...patch };
    copy[dayIndex] = { ...copy[dayIndex], exercises };
    this.days.set(copy);
  }

  /**
   * L'ordine degli esercizi determina l'ordine di esecuzione.
   *
   * complete(false) e' essenziale: senza argomento Ionic sposta esso stesso
   * il nodo nel DOM, e sommandosi all'aggiornamento del modello si otteneva
   * un doppio spostamento, con la riga che tornava al posto sbagliato.
   * Passando false, Ionic annulla il proprio spostamento e lascia che sia
   * Angular a ridisegnare la lista secondo il modello, che e' l'unica
   * fonte di verita'.
   */
  reorderExercises(dayIndex: number, event: CustomEvent<ItemReorderEventDetail>): void {
    const { from, to } = event.detail;
    event.detail.complete(false);

    if (from === to) return;

    const copy = [...this.days()];
    const exercises = [...copy[dayIndex].exercises];
    const [moved] = exercises.splice(from, 1);
    exercises.splice(to, 0, moved);
    // Uno spostamento dentro un'altra sezione viene ricondotto alla sezione
    // giusta (in fondo); spostando invece il primo esercizio di una sezione
    // sopra un'altra, e' l'intera sezione a salire.
    copy[dayIndex] = { ...copy[dayIndex], exercises: this.sistemaGiorno(exercises) };
    this.days.set(copy);
  }

  /**
   * Dopo uno spostamento o una rimozione la prima riga potrebbe risultare
   * collegata a nulla: qui il collegamento viene sciolto.
   */
  private normalizza(esercizi: DraftExercise[]): DraftExercise[] {
    return esercizi.map((ex, i) =>
      i === 0 && ex.linkedToPrevious ? { ...ex, linkedToPrevious: false } : ex
    );
  }

  /**
   * Collegamenti corretti e righe raccolte per gruppo muscolare.
   *
   * L'ordine salvato coincide cosi' con quello mostrato: il cliente, lo
   * storico e il PDF vedono la stessa sequenza dell'istruttore. I superset
   * si spostano interi e restano sotto il gruppo del primo esercizio.
   */
  private sistemaGiorno(esercizi: DraftExercise[]): DraftExercise[] {
    return this.normalizza(
      ordinaPerGruppoMuscolare(this.normalizza(esercizi), (ex) => ex.muscleGroup)
    );
  }

  /**
   * Gruppo da mostrare come intestazione sopra la riga, solo dove inizia
   * una sezione nuova. Una sezione puo' iniziare solo con il primo
   * esercizio di un blocco: i membri di un superset seguono il loro.
   */
  sezioneDi(day: DraftDay, exerciseIndex: number): MuscleGroup | null {
    const righe = day.exercises;
    const riga = righe[exerciseIndex];
    if (exerciseIndex > 0 && riga.linkedToPrevious) return null;

    // Gruppo del blocco precedente = gruppo del suo primo esercizio.
    let i = exerciseIndex - 1;
    while (i > 0 && righe[i].linkedToPrevious) i--;
    const precedente = i >= 0 ? righe[i].muscleGroup : null;

    return riga.muscleGroup !== precedente ? riga.muscleGroup : null;
  }

  // ------------------------------------------------------------ superset

  /**
   * Collega o scollega un esercizio dal precedente.
   * La prima riga di un giorno non puo' mai essere collegata:
   * non ha nulla a cui agganciarsi.
   */
  toggleCollegamento(dayIndex: number, exerciseIndex: number): void {
    if (exerciseIndex === 0) return;

    const copy = [...this.days()];
    const esercizi = [...copy[dayIndex].exercises];

    // Nel superset serie e recupero sono quelli del primo esercizio e
    // valgono per tutto il giro: con una piramidale non avrebbe senso.
    if (
      !esercizi[exerciseIndex].linkedToPrevious &&
      (esercizi[exerciseIndex].kind === 'PYRAMID' || esercizi[exerciseIndex - 1].kind === 'PYRAMID')
    ) {
      void this.showToast('Un esercizio piramidale non può far parte di un superset.', 'warning');
      return;
    }

    esercizi[exerciseIndex] = {
      ...esercizi[exerciseIndex],
      linkedToPrevious: !esercizi[exerciseIndex].linkedToPrevious,
    };
    // Scollegato, un esercizio torna nella sezione del proprio gruppo.
    copy[dayIndex] = { ...copy[dayIndex], exercises: this.sistemaGiorno(esercizi) };
    this.days.set(copy);
  }

  /**
   * Blocchi del giorno, ricavati dalla sequenza dei collegamenti.
   * Serve solo per la resa grafica: il dato salvato resta la lista piatta.
   */
  blocchiDelGiorno(day: DraftDay): { indici: number[]; superset: boolean; sigla: string | null }[] {
    const gruppi: number[][] = [];
    day.exercises.forEach((ex, i) => {
      if (i === 0 || !ex.linkedToPrevious) {
        gruppi.push([i]);
      } else {
        gruppi[gruppi.length - 1].push(i);
      }
    });

    let contatore = 0;
    return gruppi.map((indici) => {
      const superset = indici.length > 1;
      return {
        indici,
        superset,
        sigla: superset ? String.fromCharCode(65 + contatore++) : null,
      };
    });
  }

  /** Sigla mostrata accanto all'esercizio: A1, A2 per i superset, il numero altrimenti. */
  siglaDi(day: DraftDay, exerciseIndex: number): string {
    for (const blocco of this.blocchiDelGiorno(day)) {
      const posizione = blocco.indici.indexOf(exerciseIndex);
      if (posizione >= 0) {
        return blocco.superset
          ? `${blocco.sigla}${posizione + 1}`
          : String(exerciseIndex + 1);
      }
    }
    return String(exerciseIndex + 1);
  }

  /** Vero se questa riga e' il capogruppo di un superset. */
  apreSuperset(day: DraftDay, exerciseIndex: number): boolean {
    return this.blocchiDelGiorno(day).some(
      (b) => b.superset && b.indici[0] === exerciseIndex
    );
  }

  private indiciDelBlocco(day: DraftDay, exerciseIndex: number): number[] {
    const blocco = this.blocchiDelGiorno(day).find((b) =>
      b.indici.includes(exerciseIndex)
    );
    return blocco?.indici ?? [exerciseIndex];
  }

  /** Modificando i giri, il valore vale per tutti gli esercizi del blocco. */
  aggiornaGiri(dayIndex: number, exerciseIndex: number, sets: number): void {
    const day = this.days()[dayIndex];
    this.aggiornaBlocco(dayIndex, this.indiciDelBlocco(day, exerciseIndex), { sets });
  }

  aggiornaRecupero(dayIndex: number, exerciseIndex: number, restSeconds: number): void {
    const day = this.days()[dayIndex];
    this.aggiornaBlocco(dayIndex, this.indiciDelBlocco(day, exerciseIndex), { restSeconds });
  }

  /** Giri e recupero valgono per l'intero blocco: si scrivono su tutti i membri. */
  aggiornaBlocco(
    dayIndex: number,
    indici: number[],
    patch: Partial<DraftExercise>
  ): void {
    const copy = [...this.days()];
    const esercizi = [...copy[dayIndex].exercises];
    for (const i of indici) {
      esercizi[i] = { ...esercizi[i], ...patch };
    }
    copy[dayIndex] = { ...copy[dayIndex], exercises: esercizi };
    this.days.set(copy);
  }

  // ------------------------------------------------------------ piramidali

  /** In un superset (o all'inizio di uno) la piramidale non si puo' scegliere. */
  inSuperset(day: DraftDay, exerciseIndex: number): boolean {
    return day.exercises[exerciseIndex].linkedToPrevious || this.apreSuperset(day, exerciseIndex);
  }

  impostaTipo(dayIndex: number, exerciseIndex: number, kind: ExerciseKind): void {
    const ex = this.days()[dayIndex].exercises[exerciseIndex];
    if (ex.kind === kind) return;

    if (kind === 'PYRAMID' && ex.pyramidSets.length === 0) {
      // Si parte dalle serie e dal peso gia' scritti: 4 serie diventano
      // 4 righe da rifinire, invece di un modulo vuoto.
      const quante = Math.min(Math.max(ex.sets || 4, 2), 12);
      const serie: DraftSet[] = Array.from({ length: quante }, () => ({
        reps: String(ex.reps ?? '').trim() || '10',
        suggestedWeight: ex.suggestedWeight ?? null,
      }));
      this.updateExercise(dayIndex, exerciseIndex, { kind, pyramidSets: serie });
      return;
    }

    this.updateExercise(dayIndex, exerciseIndex, { kind });
  }

  aggiornaSerie(dayIndex: number, exerciseIndex: number, indice: number, patch: Partial<DraftSet>): void {
    const ex = this.days()[dayIndex].exercises[exerciseIndex];
    const serie = ex.pyramidSets.map((s, i) => (i === indice ? { ...s, ...patch } : s));
    this.updateExercise(dayIndex, exerciseIndex, { pyramidSets: serie });
  }

  aggiungiSerie(dayIndex: number, exerciseIndex: number): void {
    const ex = this.days()[dayIndex].exercises[exerciseIndex];
    if (ex.pyramidSets.length >= 12) return;
    const ultima = ex.pyramidSets[ex.pyramidSets.length - 1];
    this.updateExercise(dayIndex, exerciseIndex, {
      pyramidSets: [...ex.pyramidSets, { reps: ultima?.reps ?? '10', suggestedWeight: ultima?.suggestedWeight ?? null }],
    });
  }

  rimuoviSerie(dayIndex: number, exerciseIndex: number, indice: number): void {
    const ex = this.days()[dayIndex].exercises[exerciseIndex];
    if (ex.pyramidSets.length <= 2) return;
    this.updateExercise(dayIndex, exerciseIndex, {
      pyramidSets: ex.pyramidSets.filter((_, i) => i !== indice),
    });
  }

  numeroOppureNull(valore: unknown): number | null {
    const testo = String(valore ?? '').trim().replace(',', '.');
    if (testo === '') return null;
    const n = Number(testo);
    return Number.isNaN(n) ? null : n;
  }

  // ----------------------------------------------------------- salvataggio

  /** I giorni nel formato che il server si aspetta. */
  private giorniDaInviare(): WorkoutDayInput[] {
    return this.days().map((day) => ({
      label: day.label.trim() || 'Giorno',
      exercises: day.exercises.map((ex) => {
        const piramide = ex.kind === 'PYRAMID';
        return {
          exerciseId: ex.exerciseId,
          sets: piramide ? ex.pyramidSets.length : ex.sets,
          reps: piramide
            ? ex.pyramidSets.map((s) => String(s.reps).trim()).join('-')
            : String(ex.reps).trim() || '10',
          restSeconds: ex.restSeconds ?? 60,
          suggestedWeight: piramide ? null : ex.suggestedWeight ?? null,
          notes: ex.notes?.trim() || undefined,
          linkedToPrevious: ex.linkedToPrevious,
          kind: ex.kind,
          ...(piramide
            ? {
                pyramidSets: ex.pyramidSets.map((s) => ({
                  reps: String(s.reps).trim(),
                  suggestedWeight: s.suggestedWeight,
                })),
              }
            : {}),
        };
      }),
    }));
  }

  /**
   * Salva il contenuto attuale come scheda rapida, senza toccare la scheda
   * del cliente: utile per riusare una scheda appena costruita.
   */
  async salvaComeRapida(): Promise<void> {
    if (!this.canSave) {
      await this.showToast(this.blockingReason ?? 'Completa la scheda prima di salvarla.', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Salva come scheda rapida',
      message: 'Ne viene salvata una copia da assegnare ad altri clienti. Questa scheda non cambia.',
      inputs: [{ name: 'nome', type: 'text', value: this.name.trim(), placeholder: 'Nome della scheda rapida' }],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Salva',
          role: 'confirm',
          handler: (dati: { nome?: string }) => {
            void this.creaRapida(dati.nome?.trim() || this.name.trim());
          },
        },
      ],
    });
    await alert.present();
  }

  private async creaRapida(nome: string): Promise<void> {
    try {
      await this.workoutService.createTemplate({
        name: nome,
        notes: this.notes.trim() || undefined,
        days: this.giorniDaInviare(),
      });
      await this.showToast(`"${nome}" salvata fra le schede rapide.`, 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    }
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;

    this.saving.set(true);
    this.errorMessage.set(null);

    const payloadDays = this.giorniDaInviare();

    try {
      if (this.modalitaModello()) {
        const modelloId = this.templateId();
        const payload = {
          name: this.name.trim(),
          notes: this.notes.trim() || undefined,
          days: payloadDays,
        };

        if (modelloId) {
          await this.workoutService.updateTemplate(modelloId, payload);
          await this.showToast('Scheda rapida aggiornata.', 'success');
        } else {
          await this.workoutService.createTemplate(payload);
          await this.showToast('Scheda rapida salvata.', 'success');
        }

        await this.router.navigate(['/istruttore/schede-rapide'], { replaceUrl: true });
        return;
      }

      const editingId = this.editingWorkoutId();

      if (editingId) {
        await this.workoutService.update(editingId, {
          name: this.name.trim(),
          startDate: this.startDate,
          endDate: this.endDate || '',
          notes: this.notes.trim(),
          days: payloadDays,
        });
        await this.showToast('Scheda aggiornata.', 'success');
      } else {
        await this.workoutService.create({
          userId: this.clientId,
          name: this.name.trim(),
          startDate: this.startDate,
          endDate: this.endDate || undefined,
          notes: this.notes.trim() || undefined,
          days: payloadDays,
        });
        await this.showToast('Scheda creata e assegnata.', 'success');
      }

      // Si torna al cliente, dove la scheda appena salvata compare come attiva.
      await this.router.navigate(['/istruttore/clienti', this.clientId], {
        replaceUrl: true,
      });
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const fields = err?.error?.fields;
      const firstField = fields ? Object.values(fields)[0] : undefined;
      this.errorMessage.set(
        firstField ?? err?.error?.message ?? 'Salvataggio non riuscito.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2500, color, position: 'bottom',
    });
    await toast.present();
  }
}
