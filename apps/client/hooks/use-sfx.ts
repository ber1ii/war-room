import useSound from "use-sound";

export function useSfx() {
  const [playMessage] = useSound("/sounds/message.ogg", { volume: 0.07 });
  const [playCritical] = useSound("/sounds/red_alert.wav", { volume: 0.05 });
  const [playWarning] = useSound("/sounds/warning.wav", { volume: 0.1 });
  const [playSuccess] = useSound("/sounds/success.ogg", { volume: 0.225 });

  const [playTyping] = useSound("/sounds/typing.mp3", {
    volume: 0.55,
    playbackRate: 2.0,
    interrupt: true,
  });

  return {
    playMessage,
    playCritical,
    playWarning,
    playSuccess,
    playTyping,
  };
}
