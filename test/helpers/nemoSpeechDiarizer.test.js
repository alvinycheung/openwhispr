const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NEMO_SPEECH_MODEL,
  nemoSpeechCandidates,
  buildNemoSpeechArgs,
  parseRttm,
} = require("../../src/helpers/nemoSpeechDiarizer");

// Captured from `nemo-speech diarize meeting.wav --format rttm` on a two-voice
// TTS recording. nemo-speech numbers speakers from 1; sherpa-onnx from 0.
const SAMPLE_RTTM = `[nemo-speech] diarize session started
SPEAKER meeting 1 0.000 5.169 <NA> <NA> speaker_1 <NA> <NA>
SPEAKER meeting 1 4.851 6.008 <NA> <NA> speaker_2 <NA> <NA>
SPEAKER meeting 1 10.541 3.508 <NA> <NA> speaker_1 <NA> <NA>
SPEAKER meeting 1 13.721 4.049 <NA> <NA> speaker_2 <NA> <NA>
`;

test("parseRttm converts start+duration rows into sherpa-shaped segments", () => {
  assert.deepEqual(parseRttm(SAMPLE_RTTM), [
    { start: 0, end: 5.169, speaker: "speaker_0" },
    { start: 4.851, end: 10.859, speaker: "speaker_1" },
    { start: 10.541, end: 14.049, speaker: "speaker_0" },
    { start: 13.721, end: 17.77, speaker: "speaker_1" },
  ]);
});

test("parseRttm renumbers labels by first speech, whatever the input order", () => {
  const out = parseRttm(
    "SPEAKER f 1 8.0 1.0 <NA> <NA> late <NA> <NA>\nSPEAKER f 1 1.0 2.0 <NA> <NA> early <NA> <NA>\n"
  );
  assert.deepEqual(
    out.map((s) => [s.start, s.speaker]),
    [
      [1, "speaker_0"],
      [8, "speaker_1"],
    ]
  );
});

test("parseRttm drops malformed, zero-length, and non-SPEAKER rows", () => {
  const out = parseRttm(
    [
      "SPEAKER f 1 0.0 0.0 <NA> <NA> a <NA> <NA>",
      "SPEAKER f 1 abc 1.0 <NA> <NA> a <NA> <NA>",
      "SPEAKER f 1 1.0",
      "SPKR-INFO f 1 <NA> <NA> <NA> unknown a <NA> <NA>",
      "",
      "SPEAKER f 1 2.0 1.5 <NA> <NA> b <NA> <NA>",
    ].join("\n")
  );
  assert.deepEqual(out, [{ start: 2, end: 3.5, speaker: "speaker_0" }]);
});

test("buildNemoSpeechArgs pins the Nemotron 3 model, RTTM output, and the sherpa floors", () => {
  const args = buildNemoSpeechArgs("/tmp/a.wav");
  assert.equal(args[0], "diarize");
  assert.equal(args[1], "/tmp/a.wav");
  assert.ok(args.includes(NEMO_SPEECH_MODEL));
  assert.deepEqual(args.slice(args.indexOf("--format"), args.indexOf("--format") + 2), [
    "--format",
    "rttm",
  ]);
  assert.ok(args.includes("--min-duration-on") && args.includes("--min-duration-off"));
});

test("nemoSpeechCandidates probes the installer prefix per platform and honors the override", () => {
  const mac = nemoSpeechCandidates({ platform: "darwin", env: {}, home: "/Users/u" });
  assert.equal(mac[0], "/Users/u/Library/Application Support/NeMoSpeech/bin/nemo-speech");
  assert.ok(mac.includes("/Users/u/.local/bin/nemo-speech"));

  const linux = nemoSpeechCandidates({ platform: "linux", env: {}, home: "/home/u" });
  assert.equal(linux[0], "/home/u/.local/share/nemo-speech/bin/nemo-speech");

  const win = nemoSpeechCandidates({
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
    home: "C:\\Users\\u",
  });
  assert.ok(win[0].endsWith("nemo-speech.exe"));
  assert.ok(win[0].includes("NeMoSpeech"));

  const override = nemoSpeechCandidates({
    platform: "darwin",
    env: { NEMO_SPEECH_PATH: "/custom/nemo-speech" },
    home: "/Users/u",
  });
  assert.equal(override[0], "/custom/nemo-speech");
});

const {
  parseDiarizationsResponse,
  buildDiarizationsUrl,
} = require("../../src/helpers/nemoSpeechDiarizer");

test("parseDiarizationsResponse maps the serve JSON to sherpa-shaped segments", () => {
  const body = {
    segments: [
      { start: 4.851, end: 10.859, speaker: 2 },
      { start: 0, end: 5.169, speaker: 1 },
      { start: 12, end: 12, speaker: 3 },
      { start: "x", end: 1, speaker: 4 },
    ],
  };
  assert.deepEqual(parseDiarizationsResponse(body), [
    { start: 0, end: 5.169, speaker: "speaker_0" },
    { start: 4.851, end: 10.859, speaker: "speaker_1" },
  ]);
  assert.deepEqual(parseDiarizationsResponse({}), []);
  assert.deepEqual(parseDiarizationsResponse(null), []);
});

test("buildDiarizationsUrl accepts an origin or a /v1 base", () => {
  assert.equal(
    buildDiarizationsUrl("http://100.68.189.60:8100"),
    "http://100.68.189.60:8100/v1/audio/diarizations"
  );
  assert.equal(
    buildDiarizationsUrl(" http://host:8100/v1/ "),
    "http://host:8100/v1/audio/diarizations"
  );
  assert.equal(buildDiarizationsUrl(""), null);
  assert.equal(buildDiarizationsUrl(undefined), null);
});
