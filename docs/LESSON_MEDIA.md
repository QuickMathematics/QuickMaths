# Lesson images, video, audio and Matplotlib

Attach files in **Lesson Studio**, or place them beside a `lesson-set.yaml`, `lesson-set.yml` or `lesson-set.json` manifest. Media can appear after a lesson's explanation, inside a worked example or application, and in a mastery question and its saved results.

Try the [ready-to-import geometry example](lesson-media-example.json), or inspect its [YAML source](examples/geometry-media/lesson-set.yaml) and [built folder manifest](examples/geometry-media/lesson-set.json).

The native Mathematics → Geometry branch includes **Triangle area: base and perpendicular height** (`MATH_GEOM_004`), with eight worked examples and 21 assessment scenarios. It unlocks after multiplying/dividing fractions and decimals/percents/conversions. No import is needed. All ten native Geometry lessons include Matplotlib illustrations, embedded in the curriculum for offline use.

To rebuild the native figures and their embedded assets from the repository root:

```sh
python scripts/build_geometry_figures.py
python scripts/export_web_curriculum.py
```

The figure builder also accepts `--preview-dir tmp/geometry-previews` to save PNG previews. Diagrams in generated assessments use fixed dimensions so the image and question always agree.

## Folder layout and references

```text
my-lesson/
  lesson-set.yaml
  media/
    triangle.png
    construction.webm
    construction.mp4
    narration.mp3
```

Use schema version `'2.1'`. Add `media` to a skill, example, application or problem:

```yaml
media:
  - src: media/triangle.png
    alt: A right triangle with base 4 cm and perpendicular height 3 cm.
    caption: The area is half the matching rectangle's area.
    width: 800
    height: 500
    fit: contain
  - src: media/construction.webm
    sources: [media/construction.mp4]
    poster: media/triangle.png
    alt: The perpendicular height is drawn from the vertex to the base.
    caption: Play the construction, then identify the height.
    width: 800
    height: 450
  - src: media/narration.mp3
    alt: Spoken explanation of how to identify the perpendicular height.
```

`src` is a path relative to the manifest's folder. Paths cannot escape that folder. Filenames may contain ASCII letters, numbers, underscores, hyphens, spaces and dots. Use forward slashes. `type` is optional and inferred as `image`, `video` or `audio`.

`alt` is required and should describe the teaching information, including dimensions needed to answer a question. `caption` is optional. Pixel dimensions range from 1 to 4096: width caps the display width; both dimensions set an aspect ratio that scales down on phones; height alone caps the display height. `contain` preserves the whole diagram; `cover` crops to fill the box. Prefer `contain` for geometry. Video/audio have controls and never autoplay. Provide a written equivalent of any information conveyed only by sound.

## Supported files

| Kind | Extensions |
| --- | --- |
| Images | PNG, APNG, JPG/JPEG, GIF, WebP, AVIF, SVG, BMP |
| Video | WebM, MP4/M4V, OGV |
| Audio | MP3, WAV, OGG/OGA, M4A, FLAC, Opus |

Playback depends on the browser and the codecs inside a file. For video, supply WebM plus an MP4 fallback in `sources` when useful; up to three fallback files are allowed. QuickMaths does not transcode media. See the [browser container reference](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers) for compatibility. SVG is displayed as an image, never inserted as active page markup.

## Matplotlib figures

Matplotlib runs **during authoring** and produces PNG or SVG files for the lesson. Learners need no Python installation or plotting runtime. Existing Matplotlib workflows work directly: save a figure with `fig.savefig("media/triangle.svg")` and reference that file in YAML. See [Matplotlib's static rendering backends](https://matplotlib.org/stable/users/explain/figure/backends.html).

QuickMaths also supports declarative figures in YAML:

```yaml
matplotlib_figures:
  - path: media/triangle.svg
    width: 800
    height: 500
    axes: false
    equal_aspect: true
    layers:
      - type: polygon
        points: [[0, 0], [4, 0], [0, 3]]
        color: '#153f36'
      - type: text
        at: [1.6, -0.4]
        text: '4 cm'
      - type: text
        at: [-0.15, 1.5]
        align: right
        text: '3 cm'
```

Also reference `media/triangle.svg` in the lesson's `media` list. Install the authoring extra and build:

```sh
pip install -e ".[media]"
quickmaths build-lesson my-lesson/lesson-set.yaml --output built-lesson
```

The build writes `built-lesson/lesson-set.json` and the referenced media files. It generates SHA-256 digests and strips figure instructions. Upload the built folder through the publisher. For a single importable JSON file, add `--portable`; its attachments must total at most 1 MB.

Figures support `line`, `scatter`, `polygon`, `circle`, `arc`, `arrow` and `text` layers. Lines/scatter/polygons use `points`; circles/arcs use `center` and `radius`; arcs add `start`/`end` angles in degrees; arrows use `from`/`to`; text uses `at`, `text`, optional `font_size` and `align`. Common styling includes `color`, `line_width`, and `alpha`; polygons/circles accept `fill`; scatter accepts `size`; lines/scatter accept legend `label`. Figure options include `title`, `xlabel`, `ylabel`, `xlim`, `ylim`, `grid`, `legend`, `axes`, `equal_aspect` and `dpi`. Limits: 30 figures per pack, 60 layers per figure, 2,000 points per layer, figure dimensions 100–4096 px, DPI 72–240.

Imported lesson files never execute arbitrary plotting Python. Write complex Matplotlib scripts in your own authoring environment and package their saved outputs. A fixed diagram must agree with its question: do not pair a diagram labeled with fixed numbers with a question generator that changes those numbers.

## Studio, publishing and storage

In Studio, choose **Attach a file** in the lesson, example, application or question. Then edit its description, caption, dimensions and fit. Small attachments are embedded in the draft and downloaded JSON. **Open folder** also reads YAML and collects referenced files. Unrelated folder files are ignored. Studio's folder import supports the same 1 MB portable total.

For larger files, open **Publish → Open lesson folder**. Review the attachment list and sizes before publishing. Files upload before the lesson manifest, and the published lesson is pinned to the GitHub revision containing them. Public publishing uses the separate public lesson repository, never private Workspace Storage. If interrupted, review and retry; matching completed uploads are reused. Rebuild the folder after changing a media file so its digest matches.

Limits: 25 MB per file, 100 MB total per folder, 60 assets per pack, 12 media items per lesson section, 2 MB manifest. Hosted attachments stay outside workspace JSON; their paths, sizes, digests and source folder are preserved in installs, exports, backups and storage merges. They require their hosting repository to remain available. Portable embedded files travel inside the backup and work without a media download. Browser caching of hosted media is not an offline guarantee.

Built manifests use an `assets` array:

```json
{"path":"media/triangle.png","mime_type":"image/png","bytes":12345,"sha256":"<64 hexadecimal characters>"}
```

Portable assets also contain `data_base64`. Installed hosted packs contain `asset_base_url`, derived from the downloaded manifest's folder. Supported hosts are raw GitHub and GitHub Pages (plus localhost for development). Media downloads carry no GitHub token, reject redirects, and must match the declared size and digest before display. Do not hand-edit a digest to silence an unexpected mismatch; verify the file and rebuild from the intended source.
