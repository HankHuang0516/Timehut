package preflight

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
	"unicode/utf16"
)

// Explicit opt-in, unchanged APK and unsigned negative controls; never installed.
func TestTaskFGSActualArtifactControls(t *testing.T) {
	apk, out := os.Getenv("TIMEHUT_FGS_APK"), os.Getenv("TIMEHUT_FGS_CONTROLS")
	if apk == "" || out == "" {
		t.Skip("explicit local artifact paths required")
	}
	r, err := zip.OpenReader(apk)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	entries := map[string][]byte{}
	for _, f := range r.File {
		h, e := f.Open()
		if e != nil {
			t.Fatal(e)
		}
		b, e := io.ReadAll(h)
		h.Close()
		if e != nil {
			t.Fatal(e)
		}
		entries[f.Name] = b
	}
	raw := entries["AndroidManifest.xml"]
	if !isAXML(raw) {
		t.Fatal("actual binary APK required")
	}
	missing := bytes.Clone(raw)
	// Same-length string pool replacement preserves the binary layout.
	replacements := 0
	for _, enc := range []func(string) []byte{func(s string) []byte { return []byte(s) }, func(s string) []byte {
		v := utf16.Encode([]rune(s))
		b := make([]byte, len(v)*2)
		for i, n := range v {
			binary.LittleEndian.PutUint16(b[i*2:], n)
		}
		return b
	}} {
		old, new := enc("android.permission.FOREGROUND_SERVICE_DATA_SYNC"), enc("android.permission.FOREGROUND_SERVICE_NOPE_SYNC")
		replacements += bytes.Count(missing, old)
		missing = bytes.ReplaceAll(missing, old, new)
	}
	if replacements != 1 {
		t.Fatalf("expected one actual permission pool entry, got %d", replacements)
	}
	unknown := bytes.Clone(raw)
	var pool []string
	changed := 0
	for off := int(binary.LittleEndian.Uint16(unknown[2:4])); off+8 <= len(unknown); {
		chunk := unknown[off:]
		kind := binary.LittleEndian.Uint16(chunk)
		size := int(binary.LittleEndian.Uint32(chunk[4:8]))
		header := int(binary.LittleEndian.Uint16(chunk[2:4]))
		if size < 8 || size > len(chunk) {
			t.Fatal("invalid chunk")
		}
		chunk = chunk[:size]
		if kind == chunkStringPool {
			pool, err = parseStringPool(chunk)
			if err != nil {
				t.Fatal(err)
			}
		}
		if kind == chunkXMLStartElement {
			start := header + int(binary.LittleEndian.Uint16(chunk[header+8:]))
			stride := int(binary.LittleEndian.Uint16(chunk[header+10:]))
			count := int(binary.LittleEndian.Uint16(chunk[header+12:]))
			for i := 0; i < count; i++ {
				a := chunk[start+i*stride:]
				if poolAt(pool, binary.LittleEndian.Uint32(a[4:8])) == "foregroundServiceType" {
					if a[15] != typeIntHex || binary.LittleEndian.Uint32(a[16:20]) != 1 {
						t.Fatal("unexpected baseline type")
					}
					binary.LittleEndian.PutUint32(a[8:12], noRef)
					binary.LittleEndian.PutUint32(a[16:20], 0x1001)
					changed++
				}
			}
		}
		off += size
	}
	if changed != 1 {
		t.Fatal("expected one actual foregroundServiceType")
	}
	if err = os.MkdirAll(out, 0700); err != nil {
		t.Fatal(err)
	}
	result := map[string]any{"actualAPK": apk, "controlsUnsignedNeverInstalled": true, "providerRequests": 0}
	for name, manifest := range map[string][]byte{"missing-permission": missing, "unknown-bit": unknown} {
		filename := filepath.Join(out, name+".apk")
		h, e := os.Create(filename)
		if e != nil {
			t.Fatal(e)
		}
		w := zip.NewWriter(h)
		for _, f := range r.File {
			z, e := w.CreateHeader(&f.FileHeader)
			if e != nil {
				t.Fatal(e)
			}
			b := entries[f.Name]
			if f.Name == "AndroidManifest.xml" {
				b = manifest
			}
			if _, e = z.Write(b); e != nil {
				t.Fatal(e)
			}
		}
		if e = w.Close(); e != nil {
			t.Fatal(e)
		}
		if e = h.Close(); e != nil {
			t.Fatal(e)
		}
		report, e := Scan(filename, Options{})
		if e != nil {
			t.Fatal(e)
		}
		requireFinding(t, report, "foreground_service_type", SeverityError)
		result[name] = report
	}
	b, e := json.MarshalIndent(result, "", "  ")
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(filepath.Join(out, "artifact-controls.json"), b, 0600); e != nil {
		t.Fatal(e)
	}
}
