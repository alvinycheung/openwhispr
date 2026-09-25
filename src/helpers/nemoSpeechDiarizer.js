// Pure pieces of the nemo-speech diarization engine (NVIDIA Nemotron 3
// Diarization via NeMo-Speech.cpp). Kept free of electron imports so the
// argument builder and RTTM parser stay unit-testable (pattern:
// diarizationPolicy).

const path = require("path");

const NEMO_SPEECH_MODEL = "nvidia/Nemotron-3-Diarization";
const DIARIZATION_ENGINES = ["sherpa-onnx", "nemo-speech"];

// Where the NeMo-Speech.cpp installer puts the binary on each platform, plus
// the PATH symlink it creates and the usual package-manager prefixes. A
// packaged Electron app does not inherit the shell PATH, so these are probed
// directly; NEMO_SPEECH_PATH overrides the lot.
function nemoSpeechCandidates({ platform = process.platform, env = process.env, home } = {}) {
  const exe = platform === "win32" ? "nemo-speech.exe" : "nemo-speech";
  const candidates = [];
  if (env.NEMO_SPEECH_PATH) candidates.push(env.NEMO_SPEECH_PATH);
  if (platform === "darwin") {
    candidates.push(path.join(home, "Library", "Application Support", "NeMoSpeech", "bin", exe));
  } else if (platform === "win32") {
    candidates.push(path.join(env.LOCALAPPDATA || "", "Programs", "NeMoSpeech", "bin", exe));
  } else {
    candidates.push(path.join(home, ".local", "share", "nemo-speech", "bin", exe));
  }
  candidates.push(path.join(home, ".local", "bin", exe));
  if (platform !== "win32") {
    candidates.push("/opt/homebrew/bin/nemo-speech", "/usr/local/bin/nemo-speech");
  }
  return candidates;
}

// Same post-processing floors the sherpa-onnx path uses, so the merge step
// sees comparable segments from either engine.
function buildNemoSpeechArgs(wavPath) {
  return [
    "diarize",
    wavPath,
    "--model",
    NEMO_SPEECH_MODEL,
    "--format",
    "rttm",
    "--min-duration-on",
    "0.2",
    "--min-duration-off",
    "0.5",
  ];
}

// RTTM: `SPEAKER <file> 1 <start> <duration> <NA> <NA> <label> <NA> <NA>`.
// Labels are renumbered speaker_0, speaker_1, ... in order of first speech so
// the output matches what sherpa-onnx emits and nothing downstream can tell
// the engines apart.
function parseRttm(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "SPEAKER" || fields.length < 8) continue;
    const start = Number(fields[3]);
    const duration = Number(fields[4]);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) continue;
    rows.push({ start, end: start + duration, label: fields[7] });
  }
  rows.sort((a, b) => a.start - b.start);

  const ids = new Map();
  return rows.map(({ start, end, label }) => {
    if (!ids.has(label)) ids.set(label, `speaker_${ids.size}`);
    return { start, end, speaker: ids.get(label) };
  });
}

module.exports = {
  NEMO_SPEECH_MODEL,
  DIARIZATION_ENGINES,
  nemoSpeechCandidates,
  buildNemoSpeechArgs,
  parseRttm,
};
