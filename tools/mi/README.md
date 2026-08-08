# rebuilding assets/wasm/mi.wasm

The studio's Plaits voice and master-bus Clouds are Émilie Gillet's DSP
(github.com/pichenettes/eurorack, MIT) compiled to one standalone wasm.
The binary is checked in — you only need this if you're changing mi_wrapper.cc.

```sh
mkdir -p work && cd work
git clone --depth 1 https://github.com/pichenettes/eurorack.git
(cd eurorack && git submodule update --init --depth 1 stmlib)
git clone --depth 1 https://github.com/emscripten-core/emsdk.git
(cd emsdk && ./emsdk install latest && ./emsdk activate latest)
cd .. && ./build_mi.sh          # emits mi.wasm next to the script
node test_mi.js mi.wasm         # renders every engine, checks RMS
cp mi.wasm ../../assets/wasm/mi.wasm
```

Notes that cost an afternoon:
- build with `em++` (not emcc) or std::sort never links, and add
  stmlib/dsp/atan.cc for the atan LUT clouds' spectral mode needs.
- `-DTEST` selects the portable non-ARM code paths, same as upstream's
  own x86 unit tests.
- the wasm is STANDALONE (no JS glue): the worklet instantiates it with
  stubbed wasi imports and calls `_initialize` for the C++ ctors.
