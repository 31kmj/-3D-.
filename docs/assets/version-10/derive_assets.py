"""Derive smaller CC0 visualization assets from frozen version-3 originals.
Requires only the bundled Pillow and NumPy. No network or installation.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import hashlib, json, math, io

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parent/'version-3'


def decode_hdr(blob):
    stream=io.BytesIO(blob)
    while stream.readline().strip():
        pass
    resolution=stream.readline().decode('ascii').split()
    assert resolution[0]=='-Y' and resolution[2]=='+X',resolution
    h,w=int(resolution[1]),int(resolution[3])
    raw=np.empty((h,w,4),dtype=np.uint8)
    for y in range(h):
        marker=stream.read(4)
        assert marker[:2]==b'\x02\x02' and marker[2]*256+marker[3]==w
        channels=np.empty((4,w),dtype=np.uint8)
        for c in range(4):
            x=0
            while x<w:
                code=stream.read(1)[0]
                if code>128:
                    count=code-128;channels[c,x:x+count]=stream.read(1)[0]
                else:
                    count=code;channels[c,x:x+count]=np.frombuffer(stream.read(count),dtype=np.uint8)
                assert count and x+count<=w
                x+=count
        raw[y]=channels.T
    exponent=raw[:,:,3].astype(np.int16)
    rgb=raw[:,:,:3].astype(np.float32)*np.exp2(exponent-136)[:,:,None]
    rgb[exponent==0]=0
    return rgb


def encode_hdr(rgb):
    h,w,_=rgb.shape
    maximum=rgb.max(axis=2)
    fraction,exponent=np.frexp(maximum)
    scale=np.divide(fraction*256,maximum,out=np.zeros_like(maximum),where=maximum>1e-32)
    raw=np.empty((h,w,4),dtype=np.uint8)
    raw[:,:,:3]=np.clip(rgb*scale[:,:,None],0,255).astype(np.uint8)
    raw[:,:,3]=np.where(maximum>1e-32,exponent+128,0).astype(np.uint8)
    output=bytearray(b'#?RADIANCE\n# CC0 derived environment; linear 4x4 radiance average\nFORMAT=32-bit_rle_rgbe\n\n')
    output.extend(f'-Y {h} +X {w}\n'.encode('ascii'))
    for row in raw:
        output.extend(bytes([2,2,w>>8,w&255]))
        for channel in row.T:
            # Standard RGBE RLE permits literal runs up to 128 pixels.
            # A short greedy run encoder preserves exact RGBE samples.
            i=0
            while i<w:
                run=1
                while i+run<w and run<127 and channel[i+run]==channel[i]:run+=1
                if run>=4:
                    output.extend(bytes([128+run,int(channel[i])]))
                    i+=run
                else:
                    begin=i;i+=run
                    while i<w and i-begin<128:
                        run=1
                        while i+run<w and run<4 and channel[i+run]==channel[i]:run+=1
                        if run>=4:break
                        i+=min(run,128-(i-begin))
                    output.append(i-begin);output.extend(channel[begin:i].tobytes())
    return bytes(output)

manifest=json.loads((SOURCE/'asset_manifest.json').read_text(encoding='utf-8-sig'))
assets=[]
for original in manifest['assets']:
    source=SOURCE/original['file']
    blob=source.read_bytes()
    assert hashlib.sha256(blob).hexdigest()==original['sha256'],source.name
    output=ROOT/source.name
    if source.suffix=='.jpg':
        image=Image.open(source).convert('RGB')
        source_dimensions=list(image.size)
        image=image.resize((1024,1024),Image.Resampling.LANCZOS)
        if original['channel']=='nor_gl':
            vectors=np.asarray(image,dtype=np.float32)/127.5-1
            vectors/=np.maximum(np.linalg.norm(vectors,axis=2,keepdims=True),1e-8)
            image=Image.fromarray(np.clip((vectors+1)*127.5,0,255).astype(np.uint8),'RGB')
            image.save(output,quality=92,subsampling=0,optimize=True)
            process='Lanczos 2048->1024; tangent normal vector renormalization; JPEG quality92, 4:4:4'
        elif original['channel']=='rough':
            image.convert('L').save(output,quality=88,optimize=True)
            process='Lanczos 2048->1024; grayscale roughness; JPEG quality88'
        else:
            image.save(output,quality=90,subsampling=0,optimize=True)
            process='Lanczos 2048->1024; JPEG quality90, 4:4:4; existing sRGB interpretation retained'
        dimensions=[1024,1024]
        with Image.open(output) as check:check.load();assert list(check.size)==dimensions
    else:
        radiance=decode_hdr(blob)
        source_dimensions=[radiance.shape[1],radiance.shape[0]]
        h,w,_=radiance.shape
        reduced=radiance.reshape(h//4,4,w//4,4,3).mean(axis=(1,3))
        output.write_bytes(encode_hdr(reduced))
        check=decode_hdr(output.read_bytes())
        # RGBE quantization is less than one step per channel.
        bound=np.maximum(reduced.max(axis=2)/128,1e-8)
        assert np.all(np.abs(check-reduced)<=bound[:,:,None])
        dimensions=[check.shape[1],check.shape[0]]
        process='RGBE decode; 4x4 average in linear radiance (2048x1024->512x256); RGBE RLE encode. No exposure/colour transform.'
    derived={key:original[key] for key in ['asset_id','channel','source','license','license_url','role']}
    derived.update(file=output.name,bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest(),dimensions=dimensions,
        derived_from='assets/version-3/'+source.name,upstream_bytes=len(blob),upstream_sha256=original['sha256'],upstream_url=original['url'],
        upstream_retrieved_utc=original['retrieved_utc'],source_dimensions=source_dimensions,processing=process)
    assets.append(derived)
source_bytes=sum(a['upstream_bytes'] for a in assets)
derived_bytes=sum(a['bytes'] for a in assets)
result={'schema_version':1,'version_ordinal':10,'display_version':'V10','purpose':'smaller local derivatives of existing generic visualization textures and environment; not site survey assets',
 'assets':assets,'totals':{'upstream_binary_bytes':source_bytes,'derived_binary_bytes':derived_bytes,'saved_bytes':source_bytes-derived_bytes,'reduction_percent':round((1-derived_bytes/source_bytes)*100,2)},
 'source_policy':manifest['source_policy'],'reproduction':'Run derive_assets.py with bundled Pillow and NumPy. Original SHA-256 values are verified before processing.'}
(ROOT/'asset_manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result['totals']))
for a in assets:print(a['file'],a['dimensions'],a['bytes'])
