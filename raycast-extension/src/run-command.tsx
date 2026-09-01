import { execFile, spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { parseWorktreeOptions, type WorktreeOption } from "./lib/orca";
import { buildArgv, parseStoredCommand, type StoredArg, type StoredCommand } from "./lib/store";

interface Preferences {
  readonly polycastBin: string;
  readonly commandsDir: string;
  readonly orcaBin: string;
  readonly extraPath: string;
}

type PickerStatus = "not-needed" | "loading" | "ready" | "failed";

function expandHome(value: string): string {
  if (value === "~") return homedir();
  return value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function commandStorePath(preferences: Preferences): string {
  return expandHome(preferences.commandsDir || "~/.polycast/commands");
}

function commandEnvironment(preferences: Preferences): NodeJS.ProcessEnv {
  const extraPath = (preferences.extraPath || "")
    .split(delimiter)
    .map((entry) => expandHome(entry.trim()))
    .filter(Boolean);
  const pathEntries = [process.env.PATH ?? "", ...extraPath].filter(Boolean);
  return { ...process.env, PATH: pathEntries.join(delimiter) };
}

function appendOutput(previous: string, chunk: string | Uint8Array): string {
  return previous + (typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
}

function tailLines(value: string, limit = 200): string {
  const lines = value.split("\n");
  return lines.length > limit ? lines.slice(-limit).join("\n") : value;
}

function runArguments(
  command: StoredCommand,
  commandsDir: string,
  argv: readonly string[],
): string[] {
  const args = ["run", "--commands", commandsDir, command.id, "--"];
  if (command.modality === "text") {
    return [...args, "--text", argv[0] ?? ""];
  }
  return [...args, ...argv];
}

function PickerField({
  arg,
  status,
  options,
}: {
  readonly arg: StoredArg;
  readonly status: PickerStatus;
  readonly options: readonly WorktreeOption[];
}) {
  if (status === "ready") {
    return (
      <Form.Dropdown id={arg.name} title={arg.name} defaultValue="">
        <Form.Dropdown.Item value="" title="(resolve from current directory)" />
        {options.map((option) => (
          <Form.Dropdown.Item
            key={option.value}
            value={option.value}
            title={option.title}
            keywords={[...option.keywords]}
          />
        ))}
      </Form.Dropdown>
    );
  }

  return (
    <Form.TextField
      id={arg.name}
      title={arg.name}
      placeholder={status === "loading" ? "Loading worktrees..." : arg.placeholder}
    />
  );
}

function ArgField({
  arg,
  pickerStatus,
  worktreeOptions,
}: {
  readonly arg: StoredArg;
  readonly pickerStatus: PickerStatus;
  readonly worktreeOptions: readonly WorktreeOption[];
}) {
  if (arg.picker === "orca-worktree") {
    return <PickerField arg={arg} status={pickerStatus} options={worktreeOptions} />;
  }
  if (arg.type === "dropdown" && arg.data) {
    return (
      <Form.Dropdown id={arg.name} title={arg.name} defaultValue={arg.optional ? "" : undefined}>
        {arg.optional && <Form.Dropdown.Item value="" title="(none)" />}
        {arg.data.map((option) => (
          <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
        ))}
      </Form.Dropdown>
    );
  }
  if (arg.type === "password") {
    return <Form.PasswordField id={arg.name} title={arg.name} placeholder={arg.placeholder} />;
  }
  return <Form.TextField id={arg.name} title={arg.name} placeholder={arg.placeholder} />;
}

function CommandForm({ command }: { readonly command: StoredCommand }) {
  const navigation = useNavigation();
  const preferences = getPreferences();
  const pickerNeeded = (command.args ?? []).some((arg) => arg.picker === "orca-worktree");
  const [pickerStatus, setPickerStatus] = useState<PickerStatus>(
    pickerNeeded ? "loading" : "not-needed",
  );
  const [worktreeOptions, setWorktreeOptions] = useState<readonly WorktreeOption[]>([]);

  useEffect(() => {
    if (!pickerNeeded) return;

    execFile(
      expandHome(preferences.orcaBin || "/usr/local/bin/orca"),
      ["worktree", "list", "--json"],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          setPickerStatus("failed");
          void showToast({
            style: Toast.Style.Failure,
            title: "Could not load Orca worktrees",
            message: error.message,
          });
          return;
        }
        setWorktreeOptions(parseWorktreeOptions(stdout));
        setPickerStatus("ready");
      },
    );
  }, [pickerNeeded, preferences.orcaBin]);

  function handleSubmit(values: Form.Values) {
    const stringValues: Record<string, string> = {};
    for (const arg of command.args ?? []) {
      const value = values[arg.name];
      stringValues[arg.name] = typeof value === "string" ? value : "";
    }
    if (command.modality === "text") {
      const value = values.text;
      stringValues.text = typeof value === "string" ? value : "";
    }
    const argv =
      command.modality === "args"
        ? buildArgv(command.args ?? [], stringValues)
        : [stringValues.text ?? ""];
    navigation.push(<RunView command={command} argv={argv} />);
  }

  return (
    <Form
      navigationTitle={command.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Command" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {command.modality === "text" && (
        <Form.TextArea id="text" title="Input" placeholder="Text passed to the command" />
      )}
      {(command.args ?? []).map((arg) => (
        <ArgField
          key={arg.name}
          arg={arg}
          pickerStatus={pickerStatus}
          worktreeOptions={worktreeOptions}
        />
      ))}
    </Form>
  );
}

function RunView({
  command,
  argv,
}: {
  readonly command: StoredCommand;
  readonly argv: readonly string[];
}) {
  const preferences = getPreferences();
  const commandsDir = commandStorePath(preferences);
  const polycastBin = expandHome(preferences.polycastBin || "~/.local/bin/polycast");
  const [output, setOutput] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    const child = spawn(polycastBin, runArguments(command, commandsDir, argv), {
      env: commandEnvironment(preferences),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      setExitCode(code);
      void showToast({
        style: code === 0 ? Toast.Style.Success : Toast.Style.Failure,
        title: code === 0 ? "Polycast command finished" : "Polycast command failed",
        message: `Exit code ${code}`,
      });
    };

    child.stdout?.on("data", (chunk: string | Uint8Array) => {
      setOutput((previous) => tailLines(appendOutput(previous, chunk)));
    });
    child.stderr?.on("data", (chunk: string | Uint8Array) => {
      setOutput((previous) => tailLines(appendOutput(previous, chunk)));
    });
    child.on("error", (error: Error) => {
      setOutput((previous) => appendOutput(previous, `${error.message}\n`));
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));

    return () => {
      if (!settled && child.pid !== undefined) {
        try {
          process.kill(child.pid, "SIGTERM");
        } catch {
          // The process may have exited between the close check and cleanup.
        }
      }
    };
  }, [argv, command, commandsDir, polycastBin, preferences.extraPath]);

  const markdown = `\`\`\`text\n${tailLines(output) || "Waiting for output..."}\n\`\`\``;
  return <Detail isLoading={exitCode === null} markdown={markdown} />;
}

function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

export default function RunCommand() {
  const preferences = getPreferences();
  const [commands, setCommands] = useState<readonly StoredCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const directory = commandStorePath(preferences);
    void readdir(directory, { withFileTypes: true })
      .then(async (entries) => {
        const documents = await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map(async (entry) =>
              parseStoredCommand(await readFile(join(directory, entry.name), "utf8")),
            ),
        );
        if (mounted) {
          setCommands(
            documents
              .filter((command): command is StoredCommand => command !== null)
              .filter((command) => command.modality !== "files")
              .sort((left, right) => left.title.localeCompare(right.title)),
          );
        }
      })
      .catch((error: Error) => {
        if (mounted) {
          void showToast({
            style: Toast.Style.Failure,
            title: "Could not read polycast commands",
            message: error.message,
          });
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [preferences.commandsDir]);

  const navigation = useNavigation();
  return (
    <List isLoading={isLoading} navigationTitle="Polycast Commands">
      {commands.map((command) => (
        <List.Item
          key={command.id}
          icon={command.icon}
          title={command.title}
          subtitle={command.description}
          accessories={[{ text: command.modality }]}
          actions={
            <ActionPanel>
              <Action
                title="Run Command"
                onAction={() =>
                  navigation.push(
                    command.modality === "none" ? (
                      <RunView command={command} argv={[]} />
                    ) : (
                      <CommandForm command={command} />
                    ),
                  )
                }
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
