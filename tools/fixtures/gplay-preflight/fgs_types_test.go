package preflight

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// Regression tests for the task-local v1.0.0 patch. No scanner exemptions.
func TestTaskFGSTypedAXML(t *testing.T) {
	cases := []struct {
		name string
		bits uint32
		want []string
	}{
		{"sync", 1, []string{"dataSync"}},
		{"combined", 9, []string{"dataSync", "location"}},
		{"short", 0x800, []string{"shortService"}},
		{"processing", 0x2000, []string{"mediaProcessing"}},
		{"special", 0x40000000, []string{"specialUse"}},
		{"unknown", 0x1000, []string{"0x1000"}},
		{"mixedUnknown", 0x1001, []string{"dataSync", "0x1000"}},
		{"highUnknown", 0x80000001, []string{"dataSync", "0x80000000"}},
	}
	for _, tc := range cases {
		for _, typ := range []byte{typeIntDec, typeIntHex} {
			for _, utf8 := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%d/%t", tc.name, typ, utf8), func(t *testing.T) {
					root := testElem{name: "manifest", children: []testElem{{name: "application", children: []testElem{{name: "service", attrs: []testAttr{{ns: AndroidNS, name: "foregroundServiceType", dataType: typ, data: tc.bits}}}}}}}
					m, err := parseManifestBytes(encodeAXML(t, root, utf8))
					if err != nil {
						t.Fatal(err)
					}
					got := m.Application.Components[0].ForegroundServiceTypes
					if !reflect.DeepEqual(got, tc.want) {
						t.Fatalf("got %v want %v", got, tc.want)
					}
				})
			}
		}
	}
}

func TestTaskFGSFullScanPermissionControls(t *testing.T) {
	cases := []struct {
		name        string
		bits        int32
		permissions []string
		missing     string
	}{
		{"validSync", 1, []string{"DATA_SYNC"}, ""},
		{"missingSync", 1, nil, "DATA_SYNC"},
		{"bogusPermissionCannotSatisfy", 1, []string{"0X1"}, "DATA_SYNC"},
		{"allCombined", 9, []string{"DATA_SYNC", "LOCATION"}, ""},
		{"combinedMissingLocation", 9, []string{"DATA_SYNC"}, "LOCATION"},
		{"shortNoTypePermission", 0x800, nil, ""},
		{"unknownStillBlocks", 0x1000, nil, "0X1000"},
		{"mixedStillBlocks", 0x1001, []string{"DATA_SYNC"}, "0X1000"},
		{"zeroStillBlocks", 0, nil, "0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := cleanManifest()
			appNode(&m).children = append(appNode(&m).children, pbElem{name: "service", attrs: []pbAttr{{ns: AndroidNS, name: "name", value: ".Sync"}, {ns: AndroidNS, name: "foregroundServiceType", compiled: pbPrimInt(tc.bits)}}})
			for _, p := range tc.permissions {
				m = withPermissions(m, "android.permission.FOREGROUND_SERVICE_"+p)
			}
			r := scanFixture(t, m, nil, Options{})
			if tc.missing == "" {
				requireNoFinding(t, r, "foreground_service_type")
				requireNoFinding(t, r, "foreground_service_unused")
			} else {
				f := requireFinding(t, r, "foreground_service_type", SeverityError)
				if !strings.Contains(f.Message, "android.permission.FOREGROUND_SERVICE_"+tc.missing) {
					t.Fatal(f.Message)
				}
			}
			if len(r.Scanners) != 9 {
				t.Fatal("scanner registry reduced")
			}
			for _, s := range r.Scanners {
				if s.Skipped && s.ID != "metadata" {
					t.Fatalf("unexpected skipped scanner: %+v", s)
				}
			}
		})
	}
}
