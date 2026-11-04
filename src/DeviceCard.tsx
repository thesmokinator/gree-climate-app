import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ActionIcon,
  Button,
  Card,
  Center,
  Collapse,
  Group,
  Modal,
  Select,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconBulb,
  IconChevronDown,
  IconDroplets,
  IconAirConditioning,
  IconFlame,
  IconLeaf,
  IconMoon,
  IconPencil,
  IconPower,
  IconRefresh,
  IconRocket,
  IconSnowflake,
  IconSparkles,
  IconSun,
  IconTrash,
  IconVolumeOff,
  IconWind,
  type Icon,
} from "@tabler/icons-react";
import TempDial from "./TempDial";
import { useLang } from "./i18n";
import {
  deviceDetail,
  displayName,
  type DeviceState,
  type SavedDevice,
} from "./types";

interface ToggleDef {
  key: keyof DeviceState;
  action: string;
  label: string;
  icon: Icon;
}

const MODE_ICONS: Icon[] = [
  IconSparkles,
  IconSnowflake,
  IconDroplets,
  IconAirConditioning,
  IconSun,
];

function ToggleSwitch({
  def,
  checked,
  disabled,
  onFlip,
}: {
  def: ToggleDef;
  checked: boolean;
  disabled: boolean;
  onFlip: () => void;
}) {
  const ToggleIcon = def.icon;
  return (
    <Switch
      size="sm"
      color="teal"
      checked={checked}
      disabled={disabled}
      onChange={onFlip}
      label={
        <Group gap={6}>
          <ToggleIcon size={15} />
          <Text size="sm">{def.label}</Text>
        </Group>
      }
    />
  );
}

interface Props {
  device: SavedDevice;
  onList: (devices: SavedDevice[]) => void;
  onError: (message: string | null) => void;
}

export default function DeviceCard({ device, onList, onError }: Props) {
  const { t } = useLang();
  const mac = device.info.mac;

  const modes = MODE_ICONS.map((icon, i) => ({
    value: String(i),
    label: [t.modeAuto, t.modeCool, t.modeDry, t.modeFan, t.modeHeat][i],
    icon,
  }));

  const fanMarks = [
    t.fanAuto,
    t.fanLow,
    t.fanMLo,
    t.fanMed,
    t.fanMHi,
    t.fanHigh,
  ].map((label, value) => ({ value, label }));

  const swingV = [
    t.swOff,
    t.swFull,
    t.swTop,
    t.swUpperMiddle,
    t.swMiddle,
    t.swLowerMiddle,
    t.swBottom,
    t.swSwingUpper,
    t.swSwingUpperMiddle,
    t.swSwingMiddle,
    t.swSwingLowerMiddle,
    t.swSwingLower,
  ].map((label, value) => ({ value: String(value), label }));

  const swingH = [
    t.swOff,
    t.swFull,
    t.swLeft,
    t.swLeftCenter,
    t.swCenter,
    t.swRightCenter,
    t.swRight,
  ].map((label, value) => ({ value: String(value), label }));

  const mainToggles: ToggleDef[] = [
    { key: "turbo", action: "turbo", label: t.tglTurbo, icon: IconRocket },
    { key: "quiet", action: "quiet", label: t.tglQuiet, icon: IconVolumeOff },
    { key: "sleep", action: "sleep", label: t.tglSleep, icon: IconMoon },
    { key: "light", action: "light", label: t.tglLight, icon: IconBulb },
  ];

  const moreToggles: ToggleDef[] = [
    { key: "steady_heat", action: "steadyHeat", label: t.tglSteadyHeat, icon: IconFlame },
    { key: "power_save", action: "powerSave", label: t.tglPowerSave, icon: IconLeaf },
    { key: "fresh_air", action: "freshAir", label: t.tglFreshAir, icon: IconWind },
    { key: "xfan", action: "xfan", label: t.tglXFan, icon: IconAirConditioning },
    { key: "anion", action: "anion", label: t.tglIonizer, icon: IconSparkles },
  ];
  const [state, setState] = useState<DeviceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const fresh = await invoke<DeviceState>("get_state", { mac });
      setState(fresh);
    } catch (e) {
      onError(`"${displayName(device)}": ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [mac, device, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const control = useCallback(
    async (action: string, value: boolean | number) => {
      setBusy(true);
      onError(null);
      try {
        const fresh = await invoke<DeviceState>("set_control", {
          mac,
          action: { action, value },
        });
        setState(fresh);
      } catch (e) {
        onError(`"${displayName(device)}": ${String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [mac, device, onError],
  );

  const saveRename = useCallback(async () => {
    try {
      const updated = await invoke<SavedDevice[]>("rename_device", {
        mac,
        alias: draftName.trim() || null,
      });
      onList(updated);
      setEditing(false);
    } catch (e) {
      onError(String(e));
    }
  }, [mac, draftName, onList, onError]);

  const remove = useCallback(async () => {
    try {
      const updated = await invoke<SavedDevice[]>("remove_device", { mac });
      onList(updated);
    } catch (e) {
      onError(String(e));
    }
  }, [mac, onList, onError]);

  const isFahrenheit = state?.temperature_unit === 1;
  const unit = isFahrenheit ? "°F" : "°C";
  const minTemp = isFahrenheit ? 61 : 16;
  const maxTemp = isFahrenheit ? 86 : 30;

  return (
    <>
    <Card withBorder radius="lg" p="md">
      <Group justify="space-between" mb="xs">
        {editing ? (
          <Group gap="xs" style={{ flex: 1 }}>
            <TextInput
              placeholder={device.info.name}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              style={{ flex: 1 }}
            />
            <ActionIcon
              variant="filled"
              color="teal"
              aria-label={t.saveName}
              onClick={() => void saveRename()}
            >
              <IconPencil size={15} />
            </ActionIcon>
          </Group>
        ) : (
          <>
            <Stack gap={0}>
              <Text fw={650} size="md">
                {displayName(device)}
              </Text>
              <Text size="xs" c="dimmed">
                {deviceDetail(device.info)}
              </Text>
            </Stack>
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                aria-label={t.refreshState}
                loading={loading}
                onClick={() => void refresh()}
              >
                <IconRefresh size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                aria-label={t.renameDevice}
                onClick={() => {
                  setDraftName(device.alias ?? "");
                  setEditing(true);
                }}
              >
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                aria-label={t.removeDevice}
                onClick={() => setConfirmRemove(true)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </>
        )}
      </Group>

      {!state && <Skeleton height={420} radius="md" />}

      {state && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Switch
              size="lg"
              color="teal"
              checked={state.power}
              disabled={busy}
              onChange={() => void control("power", !state.power)}
              thumbIcon={<IconPower size={14} />}
              aria-label={t.power}
            />
            <Text size="sm" c={state.power ? "teal" : "dimmed"} fw={600}>
              {state.power ? t.powerOn : t.powerOff}
            </Text>
          </Group>

          <Center>
            <TempDial
              value={state.target_temperature}
              min={minTemp}
              max={maxTemp}
              roomTemp={state.current_temperature}
              unit={unit}
              mode={state.mode}
              disabled={busy}
              onCommit={(temp) => void control("temperature", temp)}
            />
          </Center>

          <SegmentedControl
            fullWidth
            color="teal"
            disabled={busy}
            value={String(state.mode)}
            onChange={(v) => void control("mode", Number(v))}
            data={modes.map(({ value, label, icon: ModeIcon }) => ({
              value,
              label: (
                <Center style={{ gap: 4 }}>
                  <ModeIcon size={15} />
                  <span>{label}</span>
                </Center>
              ),
            }))}
          />

          <Stack gap={2}>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                {t.fanLabel}
              </Text>
              <Text size="sm" c="dimmed">
                {fanMarks[state.fan_speed]?.label ?? ""}
              </Text>
            </Group>
            <Slider
              color="teal"
              disabled={busy}
              min={0}
              max={5}
              step={1}
              marks={fanMarks}
              value={state.fan_speed}
              onChangeEnd={(v) => void control("fanSpeed", v)}
              mb="lg"
            />
          </Stack>

          <Group grow>
            <Select
              label={t.swingVertical}
              size="sm"
              disabled={busy}
              value={String(state.swing_vertical)}
              onChange={(v) => v != null && void control("swingVertical", Number(v))}
              data={swingV}
            />
            <Select
              label={t.swingHorizontal}
              size="sm"
              disabled={busy}
              value={String(state.swing_horizontal)}
              onChange={(v) =>
                v != null && void control("swingHorizontal", Number(v))
              }
              data={swingH}
            />
          </Group>

          <SimpleGrid cols={2} spacing="xs">
            {mainToggles.map((def) => (
              <ToggleSwitch
                key={def.key}
                def={def}
                checked={Boolean(state[def.key])}
                disabled={busy}
                onFlip={() => void control(def.action, !state[def.key])}
              />
            ))}
          </SimpleGrid>

          <Button
            variant="subtle"
            size="xs"
            color="gray"
            rightSection={
              <IconChevronDown
                size={14}
                style={{
                  transform: showMore ? "rotate(180deg)" : undefined,
                  transition: "transform 150ms",
                }}
              />
            }
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? t.fewerOptions : t.moreOptions}
          </Button>
          <Collapse expanded={showMore} keepMounted={false}>
            <SimpleGrid cols={2} spacing="xs">
              {moreToggles.map((def) => (
                <ToggleSwitch
                  key={def.key}
                  def={def}
                  checked={Boolean(state[def.key])}
                  disabled={busy}
                  onFlip={() => void control(def.action, !state[def.key])}
                />
              ))}
            </SimpleGrid>
          </Collapse>
        </Stack>
      )}
    </Card>
    <Modal
      opened={confirmRemove}
      onClose={() => setConfirmRemove(false)}
      title={t.removeTitle(displayName(device))}
      centered
      size="xs"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t.removeBody}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirmRemove(false)}>
            {t.cancel}
          </Button>
          <Button
            color="red"
            onClick={() => {
              setConfirmRemove(false);
              void remove();
            }}
          >
            {t.delete}
          </Button>
        </Group>
      </Stack>
    </Modal>
    </>
  );
}
