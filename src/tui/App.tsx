import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { renderMarkdownToAnsi, invalidateCacheForWidth } from "../markdown/render";
import TextInput from "ink-text-input";
import { ChatAgent } from "../chat/agent";

type Message = { role: string; content: string; rendered?: string };

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [termWidth, setTermWidth] = useState<number>(() => (stdout?.columns ?? process.stdout.columns ?? 80));

  const agent = useMemo(() => new ChatAgent(), []);

  useInput((inputKey, key) => {
    if (key.escape) exit();
  });

  const submit = async () => {
    if (!input.trim() || busy) return;
    const goal = input.trim();
    setHistory((h) => [...h, { role: "user", content: goal }]);
    setInput("");
    setBusy(true);
    const result = await agent.chat(goal);
    await result.match(
      async (answer: string) => {
        let rendered: string | undefined;
        try {
          const widthNow = (stdout?.columns ?? process.stdout.columns ?? 80) - 4;
          rendered = await renderMarkdownToAnsi(answer, widthNow);
        } catch {
          rendered = undefined;
        }
        setHistory((h) => [...h, { role: "assistant", content: answer, rendered }]);
      },
      (error) => {
        const errorMessage = `Error (${error.kind}): ${error.message}`;
        setHistory((h) => [...h, { role: "assistant", content: errorMessage }]);
      }
    );
    setBusy(false);
  };

  // Recompute rendered assistant messages when terminal width changes
  useEffect(() => {
    const handleResize = () => {
      const next = stdout?.columns ?? process.stdout.columns ?? 80;
      setTermWidth(next);
    };

    if (stdout && typeof stdout.on === 'function') {
      stdout.on('resize', handleResize);
      return () => {
        // @ts-ignore Node typings: off exists on EventEmitter in Node >= 10
        stdout.off?.('resize', handleResize);
      };
    } else if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.on('resize', handleResize);
      return () => {
        process.stdout.off('resize', handleResize);
      };
    }
  }, [stdout]);

  useEffect(() => {
    // Invalidate cache for new width and recompute rendered outputs
    if (!history.length) return;
    const widthNow = (termWidth ?? 80) - 4;
    invalidateCacheForWidth(widthNow);
    Promise.all(
      history.map(async (m) => {
        if (m.role !== 'assistant') return m;
        try {
          const rendered = await renderMarkdownToAnsi(m.content, widthNow);
          return { ...m, rendered } as Message;
        } catch {
          return { ...m, rendered: undefined } as Message;
        }
      })
    ).then((updated) => setHistory(updated as Message[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termWidth]);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" padding={1} flexDirection="column">
        {history.map((m, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={m.role === "user" ? "cyan" : "green"}>
              {m.role === "user" ? "You" : "Agent"}:
            </Text>
            <Box marginLeft={1}>
              {m.role === "assistant" ? (
                <Text>{m.rendered ?? m.content}</Text>
              ) : (
                <Text>{m.content}</Text>
              )}
            </Box>
          </Box>
        ))}
        {busy && (
          <Text color="yellow">Thinking...</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Enter a goal and press Enter. Press Esc to quit.</Text>
      </Box>
      <Box>
        <TextInput
          placeholder="e.g., compute (23+19)^2 using calculator"
          value={input}
          onChange={setInput}
          onSubmit={submit}
        />
      </Box>
    </Box>
  );
}
