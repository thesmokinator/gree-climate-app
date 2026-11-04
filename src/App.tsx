import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch, IconSettings, IconWifi } from "@tabler/icons-react";
import DeviceCard from "./DeviceCard";
import { useLang, type Lang } from "./i18n";
import useFitWindow from "./useFitWindow";
import {
  deviceDetail,
  displayName,
  type DeviceInfo,
  type SavedDevice,
} from "./types";

type Step = "loading" | "welcome" | "network" | "discover" | "ready";

export default function App() {
  const [step, setStep] = useState<Step>("loading");
  const [saved, setSaved] = useState<SavedDevice[]>([]);
  const [discovered, setDiscovered] = useState<DeviceInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState("");
  const [manualName, setManualName] = useState("");
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Tab reorder uses pointer dragging, not native HTML5 drag-and-drop:
  // re-rendering mid-drag kills the native drag session in webviews,
  // while pointer moves survive re-renders just fine.
  const listRef = useRef<HTMLDivElement | null>(null);
  const tabDrag = useRef<{ mac: string; startX: number; moved: boolean } | null>(null);
  const orderRef = useRef<SavedDevice[]>([]);
  const savedRef = useRef<SavedDevice[]>([]);
  savedRef.current = saved;

  // Hug the window height to the content height, in both directions.
  useFitWindow();

  const { t, lang, setLang } = useLang();
  const savedMacs = new Set(saved.map((d) => d.info.mac));

  // Keep the active tab pointing at an existing device.
  useEffect(() => {
    if (step !== "ready") return;
    if (
      activeTab != null &&
      activeTab !== "settings" &&
      !saved.some((d) => d.info.mac === activeTab)
    ) {
      setActiveTab(saved[0]?.info.mac ?? "settings");
    } else if (activeTab == null) {
      setActiveTab(saved[0]?.info.mac ?? "settings");
    }
  }, [saved, activeTab, step]);

  const persistOrder = useCallback(async (order: SavedDevice[]) => {
    try {
      await invoke("set_device_order", {
        macs: order.map((d) => d.info.mac),
      });
    } catch (e) {
      setError(String(e));
      try {
        setSaved(await invoke<SavedDevice[]>("get_saved_devices"));
      } catch {
        // Keep the optimistic order when even reloading fails.
      }
    }
  }, []);

  const onTabPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, mac: string) => {
      if (e.button !== 0 || !e.isPrimary) return;
      tabDrag.current = { mac, startX: e.clientX, moved: false };
      orderRef.current = [];
      // Keep move/up events flowing to the tab even when the pointer
      // leaves it mid-drag; without capture the reorder stalls on gaps.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Older webviews may refuse capture; dragging still mostly works.
      }
    },
    [],
  );

  const onTabPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const drag = tabDrag.current;
    const list = listRef.current;
    if (!drag || !list) return;
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      list.classList.add("tab-dragging");
    }
    const tabs = Array.from(list.querySelectorAll<HTMLElement>("[data-tab-mac]"));
    let target = tabs.length - 1;
    for (let i = 0; i < tabs.length; i++) {
      const rect = tabs[i].getBoundingClientRect();
      if (e.clientX < rect.left + rect.width / 2) {
        target = i;
        break;
      }
    }
    setSaved((prev) => {
      const from = prev.findIndex((d) => d.info.mac === drag.mac);
      if (from === -1 || from === target) return prev;
      const order = [...prev];
      const [moved] = order.splice(from, 1);
      order.splice(target, 0, moved);
      orderRef.current = order;
      return order;
    });
  }, []);

  const onTabPointerUp = useCallback(
    (mac: string) => {
      const drag = tabDrag.current;
      tabDrag.current = null;
      listRef.current?.classList.remove("tab-dragging");
      if (!drag?.moved) return;
      // Plain clicks are handled by Tabs itself; a real drag keeps its tab.
      setActiveTab(mac);
      const order =
        orderRef.current.length > 0 ? orderRef.current : savedRef.current;
      void persistOrder(order);
    },
    [persistOrder],
  );

  const onTabPointerCancel = useCallback(() => {
    tabDrag.current = null;
    listRef.current?.classList.remove("tab-dragging");
  }, []);

  // On launch: skip the wizard when devices were saved before.
  useEffect(() => {
    invoke<SavedDevice[]>("get_saved_devices")
      .then((devices) => {
        if (devices.length > 0) {
          setSaved(devices);
          setStep("ready");
        } else {
          setStep("welcome");
        }
      })
      .catch((e) => {
        setError(String(e));
        setStep("welcome");
      });
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const found = await invoke<DeviceInfo[]>("discover_devices");
      setDiscovered(found);
      setSelected(new Set(found.map((d) => d.mac)));
      if (found.length === 0) {
        setError(t.noAnswer);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }, [t]);

  const finish = useCallback(async () => {
    const chosen: SavedDevice[] = discovered
      .filter((d) => selected.has(d.mac))
      .map((info) => ({ info, alias: aliases[info.mac]?.trim() || null }));
    try {
      const merged = await invoke<SavedDevice[]>("complete_onboarding", {
        devices: chosen,
      });
      setSaved(merged);
      setStep("ready");
    } catch (e) {
      setError(String(e));
    }
  }, [discovered, selected, aliases]);

  const toggle = useCallback((mac: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mac)) {
        next.delete(mac);
      } else {
        next.add(mac);
      }
      return next;
    });
  }, []);

  const addByIp = useCallback(async () => {
    if (!manualIp.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const added = await invoke<SavedDevice>("add_device_by_ip", {
        ip: manualIp.trim(),
        alias: manualName.trim() || null,
      });
      setSaved((prev) => {
        const rest = prev.filter((d) => d.info.mac !== added.info.mac);
        return [...rest, added];
      });
      setManualIp("");
      setManualName("");
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }, [manualIp, manualName]);

  return (
    <Container size="xs" py="md">
      {step === "loading" && <Text c="dimmed">{t.loading}</Text>}

      {step === "welcome" && (
        <Card withBorder radius="lg" p="lg">
          <Stack>
            <Title order={2}>{t.welcomeTitle}</Title>
            <Text size="sm">{t.welcomeDesc}</Text>
            <Group justify="flex-end">
              <Button color="teal" onClick={() => setStep("network")}>
                {t.getStarted}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {step === "network" && (
        <Card withBorder radius="lg" p="lg">
          <Stack>
            <Title order={2}>{t.networkTitle}</Title>
            <Text size="sm">{t.networkDesc}</Text>
            <Group justify="space-between">
              <Button variant="subtle" onClick={() => setStep("welcome")}>
                {t.back}
              </Button>
              <Button
                color="teal"
                leftSection={<IconWifi size={16} />}
                onClick={() => {
                  setStep("discover");
                  void scan();
                }}
              >
                {t.scanMyNetwork}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {step === "discover" && (
        <Card withBorder radius="lg" p="lg">
          <Stack>
            <Title order={2}>{t.chooseDevices}</Title>
            <Text size="sm" c="dimmed">
              {scanning ? t.scanningLive : t.devicesFound(discovered.length)}
            </Text>
            {discovered.map((d) => (
              <Group key={d.mac} gap="sm" wrap="nowrap" align="flex-start">
                <Checkbox
                  mt={4}
                  aria-label={t.selectDevice(d.name)}
                  checked={selected.has(d.mac)}
                  onChange={() => toggle(d.mac)}
                />
                <Stack gap={2} style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      {d.name}
                    </Text>
                    {savedMacs.has(d.mac) && (
                      <Badge color="teal" size="xs">
                        {t.alreadyAdded}
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {deviceDetail(d)}
                  </Text>
                  <TextInput
                    size="sm"
                    placeholder={t.aliasPlaceholder}
                    value={aliases[d.mac] ?? ""}
                    onChange={(e) =>
                      setAliases((prev) => ({
                        ...prev,
                        [d.mac]: e.target.value,
                      }))
                    }
                  />
                </Stack>
              </Group>
            ))}
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Group justify="space-between">
              <Button
                variant="default"
                loading={scanning}
                leftSection={<IconSearch size={16} />}
                onClick={scan}
              >
                {t.scanAgain}
              </Button>
              <Button
                color="teal"
                onClick={() => void finish()}
                disabled={selected.size === 0}
              >
                {t.done}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {step === "ready" && (
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List className="tabs-list" ref={listRef}>
            {saved.map((d) => (
              <Tabs.Tab
                key={d.info.mac}
                value={d.info.mac}
                title={t.dragToReorder}
                data-tab-mac={d.info.mac}
                onPointerDown={(e) => onTabPointerDown(e, d.info.mac)}
                onPointerMove={onTabPointerMove}
                onPointerUp={() => onTabPointerUp(d.info.mac)}
                onPointerCancel={onTabPointerCancel}
                className="device-tab"
              >
                {displayName(d)}
              </Tabs.Tab>
            ))}
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={15} />}
              className="settings-tab"
            >
              {t.settings}
            </Tabs.Tab>
          </Tabs.List>

          {saved.map((d) => (
            <Tabs.Panel key={d.info.mac} value={d.info.mac} pt="sm">
              <DeviceCard
                device={d}
                onList={setSaved}
                onError={setError}
              />
            </Tabs.Panel>
          ))}

          <Tabs.Panel value="settings" pt="sm">
            <Card withBorder radius="lg" p="lg">
              <Stack>
                <Title order={4}>{t.addByAddressTitle}</Title>
                <Text size="sm" c="dimmed">
                  {t.addByAddressDesc}
                </Text>
                <Group grow>
                  <TextInput
                    placeholder="192.168.1.100"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                  />
                  <TextInput
                    placeholder={t.officePlaceholder}
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </Group>
                <Group justify="flex-end">
                  <Button
                    color="teal"
                    loading={adding}
                    disabled={!manualIp.trim()}
                    onClick={() => void addByIp()}
                  >
                    {t.add}
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Card withBorder radius="lg" p="lg" mt="sm">
              <Stack gap="xs">
                <Title order={4}>{t.aboutTitle}</Title>
                <Text size="sm" c="dimmed">
                  {t.aboutDisclaimer}
                </Text>
                <Text size="sm" c="dimmed">
                  {t.aboutLicense}
                </Text>
                <Text size="sm" style={{ userSelect: "text" }}>
                  https://github.com/thesmokinator/gree-climate-app
                </Text>
              </Stack>
            </Card>

            <Card withBorder radius="lg" p="lg" mt="sm">
              <Stack gap="xs">
                <Title order={4}>{t.languageTitle}</Title>
                <Select
                  value={lang}
                  onChange={(v) => {
                    if (v === "en" || v === "it") setLang(v satisfies Lang);
                  }}
                  data={[
                    { value: "en", label: "English" },
                    { value: "it", label: "Italiano" },
                  ]}
                />
              </Stack>
            </Card>

            {error && (
              <Alert color="red" variant="light" mt="sm">
                {error}
              </Alert>
            )}
            <Group justify="flex-end" mt="sm">
              <Button
                variant="default"
                leftSection={<IconSearch size={16} />}
                onClick={() => {
                  setStep("discover");
                  void scan();
                }}
              >
                {t.scanNetwork}
              </Button>
            </Group>
          </Tabs.Panel>
        </Tabs>
      )}
    </Container>
  );
}
