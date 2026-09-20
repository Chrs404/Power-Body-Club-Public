import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton,
  IonButton, IonInput, IonItem, IonList, IonLabel, IonSpinner, IonIcon,
  IonModal, IonSearchbar, IonTextarea, IonReorder, IonReorderGroup,
  IonNote, IonChip, IonAccordion, IonAccordionGroup, IonBadge, IonFooter,
  IonSelect, IonSelectOption,
  AlertController, ToastController, ItemReorderEventDetail,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, trashOutline, addCircleOutline, closeCircleOutline, saveOutline,
  linkOutline, unlinkOutline, arrowBackOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { ClientService } from '../../../core/services/client.service';
import {
  Exercise, ExerciseInput, MuscleGroup, MUSCLE_GROUPS, MUSCLE_GROUP_LABELS,
} from '../../../core/models/exercise.model';
import { Workout, WorkoutDayInput, WorkoutExerciseInput } from '../../../core/models/workout.model';

/**
 * Riga in costruzione: tiene anche il nome, per non rileggere il catalogo.
 *
 * uid e' un identificativo locale, non salvato: serve solo come chiave
 * stabile per @for. Con "track $index" Angular riusa i nodi per posizione
 * e non li riordina mai, il che rende impossibile il trascinamento.
 */
interface DraftExercise extends WorkoutExerciseInput {
  uid: string;
  exerciseName: string;
  /** Superset: eseguito di fila con l'esercizio precedente. */
  linkedToPrevious: boolean;
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
    FormsModule, ReactiveFormsModule,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton,
    IonButton, IonInput, IonItem, IonList, IonLabel, IonSpinner, IonIcon,
    IonModal, IonSearchbar, IonTextarea, IonReorder, IonReorderGroup,
    IonNote, IonChip, IonAccordion, IonAccordionGroup, IonBadge, IonFooter,
    IonSelect, IonSelectOption,
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
    return (
      this.name.trim().length >= 2 &&
      this.days().length > 0 &&
      this.totalExercises > 0
    );
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
    return null;
  }

  constructor() {
    addIcons({
      add, trashOutline, addCircleOutline, closeCircleOutline, saveOutline,
      linkOutline, unlinkOutline, arrowBackOutline,
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
      } else {
        this.iniziaNuova();
      }
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(
        err?.error?.message ?? 'Impossibile caricare i dati. Torna indietro e riprova.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Dove porta il pulsante indietro quando non c'e' cronologia:
   * alle schede del cliente su cui si sta lavorando, non a un elenco
   * generico da cui bisognerebbe ritrovarlo.
   */
  percorsoRitorno(): string {
    if (this.modalitaModello()) return '/istruttore/schede-rapide';
    return this.clientId
      ? `/istruttore/clienti/${this.clientId}/schede`
      : '/istruttore/clienti';
  }

  private iniziaNuova(): void {
    this.days.set([{ uid: nuovoUid('giorno'), label: 'Giorno 1', exercises: [] }]);
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
      exercises: day.exercises.map((we) => ({
        uid: nuovoUid('esercizio'),
        linkedToPrevious: we.linkedToPrevious,
        exerciseId: we.exerciseId,
        exerciseName: we.exercise.name,
        sets: we.sets,
        reps: we.reps,
        restSeconds: we.restSeconds,
        suggestedWeight:
          we.suggestedWeight !== null ? Number(we.suggestedWeight) : null,
        notes: we.notes ?? undefined,
      })),
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
  private async precompilaDaModello(id: number): Promise<void> {
    try {
      const modello = await this.workoutService.getTemplate(id);
      this.name = modello.name;
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
    this.days.set(
      workout.days.map((day) => ({
        uid: nuovoUid('giorno'),
        label: day.label,
        exercises: day.exercises.map((we) => ({
          uid: nuovoUid('esercizio'),
          linkedToPrevious: we.linkedToPrevious,
          exerciseId: we.exerciseId,
          exerciseName: we.exercise.name,
          sets: we.sets,
          reps: we.reps,
          restSeconds: we.restSeconds,
          suggestedWeight:
            we.suggestedWeight !== null ? Number(we.suggestedWeight) : null,
          notes: we.notes ?? undefined,
        })),
      }))
    );
  }

  addDay(): void {
    const current = this.days();
    this.days.set([
      ...current,
      { uid: nuovoUid('giorno'), label: `Giorno ${current.length + 1}`, exercises: [] },
    ]);
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
  }

  updateDayLabel(index: number, label: string): void {
    const copy = [...this.days()];
    copy[index] = { ...copy[index], label };
    this.days.set(copy);
  }

  openPicker(dayIndex: number): void {
    this.targetDayIndex = dayIndex;
    this.catalogSearch = '';
    this.selezione.set([]);
    this.pickerOpen.set(true);
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
    const scelti = this.selezione();
    if (scelti.length === 0) return;

    const copy = [...this.days()];
    const day = copy[this.targetDayIndex];

    const nuoveRighe = scelti.map((exercise) => ({
      uid: nuovoUid('esercizio'),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      linkedToPrevious: false,
      sets: 3,
      reps: '10',
      restSeconds: 60,
      suggestedWeight: null,
    }));

    copy[this.targetDayIndex] = {
      ...day,
      exercises: [...day.exercises, ...nuoveRighe],
    };

    this.days.set(copy);
    this.chiudiPicker();
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
      muscleGroup: 'CHEST',
      description: '',
    });
    this.creandoEsercizio.set(true);
  }

  annullaCreazioneEsercizio(): void {
    this.creandoEsercizio.set(false);
    this.erroreEsercizio.set(null);
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
    };

    try {
      const creato = await this.exerciseService.create(payload);

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
      exercises: this.normalizza(
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
    copy[dayIndex] = { ...copy[dayIndex], exercises: this.normalizza(exercises) };
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
    esercizi[exerciseIndex] = {
      ...esercizi[exerciseIndex],
      linkedToPrevious: !esercizi[exerciseIndex].linkedToPrevious,
    };
    copy[dayIndex] = { ...copy[dayIndex], exercises: esercizi };
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

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;

    this.saving.set(true);
    this.errorMessage.set(null);

    const payloadDays: WorkoutDayInput[] = this.days().map((day) => ({
      label: day.label.trim() || 'Giorno',
      exercises: day.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets,
        reps: String(ex.reps).trim() || '10',
        restSeconds: ex.restSeconds ?? 60,
        suggestedWeight: ex.suggestedWeight ?? null,
        notes: ex.notes?.trim() || undefined,
        linkedToPrevious: ex.linkedToPrevious,
      })),
    }));

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

      await this.router.navigate(['/istruttore/clienti', this.clientId, 'schede'], {
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
