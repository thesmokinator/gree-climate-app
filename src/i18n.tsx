import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "it";

const en = {
  loading: "Loading…",
  getStarted: "Get started",
  welcomeTitle: "Gree Climate",
  welcomeDesc:
    "A menu-bar companion for your GREE air conditioners. It lives in the menu bar, out of the way, and lets you switch devices on and off or change temperature in one click.",
  networkTitle: "Local network access",
  networkDesc:
    "Your air conditioners are found over the local network. When macOS asks for permission, accept so the scan can reach them. Nothing leaves your home network.",
  back: "Back",
  scanMyNetwork: "Scan my network",
  chooseDevices: "Choose your devices",
  scanningLive: "Broadcasting on UDP port 7000, listening for answers…",
  devicesFound: (n: number) =>
    `${n} device(s) found. Give each one a name you will recognize.`,
  selectDevice: (name: string) => `Select ${name}`,
  aliasPlaceholder: "Name, e.g. Bedroom",
  noAnswer: "No air conditioner answered. Check Wi-Fi and retry.",
  scanAgain: "Scan again",
  done: "Done",
  alreadyAdded: "Added",
  settings: "Settings",
  dragToReorder: "Drag to reorder",
  addByAddressTitle: "Add by address",
  addByAddressDesc:
    "For a device the scan misses, enter its IP. The app asks the device itself for its identity before saving it.",
  officePlaceholder: "Name, e.g. Office",
  add: "Add",
  scanNetwork: "Scan network",
  aboutTitle: "About",
  aboutDisclaimer:
    "Gree Climate is an unofficial open-source companion for GREE air conditioners. It is not affiliated with, endorsed, or supported by GREE Electric Appliances. All communication stays on your local network.",
  aboutLicense: "Released under the MIT License. Source code:",
  languageTitle: "Language",
  saveName: "Save name",
  refreshState: "Refresh state",
  renameDevice: "Rename device",
  removeDevice: "Remove device",
  power: "Power",
  powerOn: "On",
  powerOff: "Off",
  modeAuto: "Auto",
  modeCool: "Cool",
  modeDry: "Dry",
  modeFan: "Fan",
  modeHeat: "Heat",
  fanLabel: "Fan",
  fanAuto: "Auto",
  fanLow: "Low",
  fanMLo: "M-Lo",
  fanMed: "Med",
  fanMHi: "M-Hi",
  fanHigh: "High",
  swingVertical: "Swing up-down",
  swingHorizontal: "Swing left-right",
  swOff: "Off",
  swFull: "Full swing",
  swTop: "Top",
  swUpperMiddle: "Upper middle",
  swMiddle: "Middle",
  swLowerMiddle: "Lower middle",
  swBottom: "Bottom",
  swSwingUpper: "Swing upper",
  swSwingUpperMiddle: "Swing upper middle",
  swSwingMiddle: "Swing middle",
  swSwingLowerMiddle: "Swing lower middle",
  swSwingLower: "Swing lower",
  swLeft: "Left",
  swLeftCenter: "Left center",
  swCenter: "Center",
  swRightCenter: "Right center",
  swRight: "Right",
  tglTurbo: "Turbo",
  tglQuiet: "Quiet",
  tglSleep: "Sleep",
  tglLight: "Light",
  tglSteadyHeat: "Steady heat",
  tglPowerSave: "Power save",
  tglFreshAir: "Fresh air",
  tglXFan: "X-Fan",
  tglIonizer: "Ionizer",
  moreOptions: "More options",
  fewerOptions: "Fewer options",
  removeTitle: (name: string) => `Remove "${name}"?`,
  removeBody:
    "The device itself is untouched and stays on your network; it will only disappear from this app. You can add it again at any time.",
  cancel: "Cancel",
  delete: "Delete",
};

export type Strings = typeof en;

const it: Strings = {
  loading: "Caricamento…",
  getStarted: "Inizia",
  welcomeTitle: "Gree Climate",
  welcomeDesc:
    "Un compagno per i tuoi condizionatori GREE, direttamente nella barra dei menu. Accendi e spegni i dispositivi o cambia la temperatura in un clic.",
  networkTitle: "Accesso alla rete locale",
  networkDesc:
    "I tuoi condizionatori vengono trovati nella rete locale. Quando macOS chiede il permesso, accetta così la scansione può raggiungerli. Niente esce dalla tua rete domestica.",
  back: "Indietro",
  scanMyNetwork: "Scansiona la mia rete",
  chooseDevices: "Scegli i tuoi dispositivi",
  scanningLive: "Trasmissione su UDP porta 7000, in attesa di risposte…",
  devicesFound: (n: number) =>
    `${n} dispositivi trovati. Dai a ognuno un nome che riconosci.`,
  selectDevice: (name: string) => `Seleziona ${name}`,
  aliasPlaceholder: "Nome, es. Camera da letto",
  noAnswer: "Nessun condizionatore ha risposto. Controlla il Wi-Fi e riprova.",
  scanAgain: "Scansiona di nuovo",
  done: "Fine",
  alreadyAdded: "Aggiunto",
  settings: "Impostazioni",
  dragToReorder: "Trascina per riordinare",
  addByAddressTitle: "Aggiungi per indirizzo",
  addByAddressDesc:
    "Per un dispositivo non trovato dalla scansione, inserisci il suo IP. L'app chiederà al dispositivo stesso la sua identità prima di salvarlo.",
  officePlaceholder: "Nome, es. Ufficio",
  add: "Aggiungi",
  scanNetwork: "Scansiona rete",
  aboutTitle: "Informazioni",
  aboutDisclaimer:
    "Gree Climate è un compagno non ufficiale e open source per i condizionatori GREE. Non è affiliato, approvato o supportato da GREE Electric Appliances. Tutta la comunicazione resta nella tua rete locale.",
  aboutLicense: "Rilasciato sotto licenza MIT. Codice sorgente:",
  languageTitle: "Lingua",
  saveName: "Salva nome",
  refreshState: "Aggiorna stato",
  renameDevice: "Rinomina dispositivo",
  removeDevice: "Rimuovi dispositivo",
  power: "Accensione",
  powerOn: "Acceso",
  powerOff: "Spento",
  modeAuto: "Auto",
  modeCool: "Freddo",
  modeDry: "Deumidifica",
  modeFan: "Ventola",
  modeHeat: "Caldo",
  fanLabel: "Ventola",
  fanAuto: "Auto",
  fanLow: "Bassa",
  fanMLo: "M-Bassa",
  fanMed: "Media",
  fanMHi: "M-Alta",
  fanHigh: "Alta",
  swingVertical: "Oscillazione verticale",
  swingHorizontal: "Oscillazione orizzontale",
  swOff: "Spento",
  swFull: "Completa",
  swTop: "In alto",
  swUpperMiddle: "Medio-alta",
  swMiddle: "Al centro",
  swLowerMiddle: "Medio-bassa",
  swBottom: "In basso",
  swSwingUpper: "Oscilla in alto",
  swSwingUpperMiddle: "Oscilla medio-alta",
  swSwingMiddle: "Oscilla al centro",
  swSwingLowerMiddle: "Oscilla medio-bassa",
  swSwingLower: "Oscilla in basso",
  swLeft: "A sinistra",
  swLeftCenter: "Centro-sinistra",
  swCenter: "Al centro",
  swRightCenter: "Centro-destra",
  swRight: "A destra",
  tglTurbo: "Turbo",
  tglQuiet: "Silenzioso",
  tglSleep: "Notte",
  tglLight: "Luce",
  tglSteadyHeat: "Calore costante",
  tglPowerSave: "Risparmio energetico",
  tglFreshAir: "Aria fresca",
  tglXFan: "X-Fan",
  tglIonizer: "Ionizzatore",
  moreOptions: "Altre opzioni",
  fewerOptions: "Meno opzioni",
  removeTitle: (name: string) => `Rimuovere "${name}"?`,
  removeBody:
    "Il dispositivo non viene toccato e resta nella tua rete; sparirà solo da questa app. Potrai aggiungerlo di nuovo in qualsiasi momento.",
  cancel: "Annulla",
  delete: "Elimina",
};

const STRINGS: Record<Lang, Strings> = { en, it };

const STORAGE_KEY = "gree-climate.lang";

function detectLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "it") return stored;
  } catch {
    // Private browsing etc: fall through to the system language.
  }
  return window.navigator.language.toLowerCase().startsWith("it")
    ? "it"
    : "en";
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Strings;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage unavailable: the choice simply does not persist.
    }
  }, [lang]);

  return (
    <LangContext.Provider
      value={{ lang, setLang: setLangState, t: STRINGS[lang] }}
    >
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
