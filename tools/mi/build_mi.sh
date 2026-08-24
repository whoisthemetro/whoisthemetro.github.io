#!/bin/bash
set -e
SCRATCH="$(cd "$(dirname "$0")" && pwd)/work"   # clone eurorack + emsdk in here
source "$SCRATCH/emsdk/emsdk_env.sh" >/dev/null 2>&1
cd "$SCRATCH/eurorack"

cp "$SCRATCH/mi_wrapper.cc" ./mi_wrapper.cc
cp "$SCRATCH/ri_wrapper.cc" ./ri_wrapper.cc
SRC="mi_wrapper.cc
ri_wrapper.cc
plaits/dsp/voice.cc
plaits/resources.cc
$(ls plaits/dsp/engine/*.cc plaits/dsp/engine2/*.cc plaits/dsp/fm/*.cc \
     plaits/dsp/speech/*.cc plaits/dsp/physical_modelling/*.cc \
     plaits/dsp/chords/*.cc 2>/dev/null)
clouds/dsp/granular_processor.cc
clouds/dsp/correlator.cc
clouds/dsp/mu_law.cc
clouds/dsp/pvoc/frame_transformation.cc
clouds/dsp/pvoc/phase_vocoder.cc
clouds/dsp/pvoc/stft.cc
clouds/resources.cc
rings/dsp/part.cc
rings/dsp/fm_voice.cc
rings/dsp/resonator.cc
rings/dsp/string.cc
rings/resources.cc
stmlib/utils/random.cc
stmlib/dsp/units.cc
stmlib/dsp/atan.cc"

em++ $SRC -I. -O2 -fno-exceptions -fno-rtti -DTEST \
  -sSTANDALONE_WASM=1 -Wl,--no-entry \
  -sEXPORTED_FUNCTIONS=_mi_init,_pl_set,_pl_note_on,_pl_note_off,_pl_render,_pl_active,_cl_init,_cl_set,_cl_process,_cl_ptr,_ri_init,_ri_set,_ri_note_on,_ri_render \
  -sINITIAL_MEMORY=33554432 -sTOTAL_STACK=1048576 \
  -o "$SCRATCH/mi.wasm"
ls -la "$SCRATCH/mi.wasm"
