# Universal Skeletal Import System

This guide explains how to easily import skeletal data from external applications like Graphite.art, Spine, DragonBones, or any custom format into Bitruvius.

## Overview

The Universal Skeletal Import System uses a **canonical intermediate representation** to bridge any external skeletal format with Bitruvius's internal joint structure. This makes it easy to:

- Import skeletons from any application that can export bone data
- Automatically map external bone names to Bitruvius joint IDs
- Validate and clean up imported data
- Export Bitruvius skeletons to universal formats

## Quick Start

### Method 1: File Upload

1. Export your skeleton from your preferred application (Graphite.art, Spine, etc.)
2. In Bitruvius, open the Import dialog
3. Upload your file (supports JSON, CSV)
4. Review the import results and apply

### Method 2: Clipboard Import

1. Copy skeletal JSON data to your clipboard
2. In Bitruvius, open the Import dialog
3. Click "Import from Clipboard"
4. Review and apply

## Supported Formats

### JSON Formats

#### Graphite.art Format
```json
{
  "bones": [
    {
      "id": "root",
      "name": "Root",
      "parent": null,
      "x": 0,
      "y": 0,
      "angle": 0,
      "length": 10
    }
  ]
}
```

#### Spine Format
```json
{
  "skeleton": {
    "spine": "3.8.99"
  },
  "bones": [
    {
      "name": "root",
      "parent": null,
      "x": 0,
      "y": 0,
      "rotation": 0,
      "scaleX": 1,
      "scaleY": 1
    }
  ]
}
```

#### DragonBones Format
```json
{
  "armature": [
    {
      "bone": [
        {
          "name": "root",
          "parent": "",
          "transform": {
            "x": 0,
            "y": 0,
            "skX": 0,
            "skY": 0,
            "scX": 1,
            "scY": 1
          }
        }
      ]
    }
  ]
}
```

### CSV Format

Create a CSV with these headers:
```csv
bone_id,name,parent_id,x,y,angle,length
root,Root,,0,0,0,0
l_shoulder,Left Shoulder,root,-50,-100,0,20
```

## Automatic Bone Mapping

The system automatically maps external bone names to Bitruvius joints using these strategies:

### 1. Direct Name Matching
- `root` → `root`
- `head` → `head`
- `left_shoulder` → `l_clavicle`

### 2. Pattern Matching
- Bones with `left_` or `l_` prefix map to left side joints
- Bones with `right_` or `r_` prefix map to right side joints

### 3. Region-Based Matching
- Bones containing `hand` map to wrist joints
- Bones containing `foot` map to toe joints

### Default Mapping Table

| External Name | Bitruvius Joint |
|---------------|-----------------|
| root, pelvis, hips, waist | root, navel |
| spine, chest, torso | sternum |
| neck | neck_base |
| head | head |
| left_shoulder, l_shoulder | l_clavicle |
| left_arm, l_arm | l_bicep |
| left_elbow, l_elbow | l_elbow |
| left_wrist, l_wrist | l_wrist |
| right_shoulder, r_shoulder | r_clavicle |
| right_arm, r_arm | r_bicep |
| right_elbow, r_elbow | r_elbow |
| right_wrist, r_wrist | r_wrist |
| left_hip, l_hip | l_hip |
| left_thigh, l_thigh | l_hip |
| left_knee, l_knee | l_knee |
| left_ankle, l_ankle | l_ankle |
| left_foot, l_foot | l_toe |
| right_hip, r_hip | r_hip |
| right_thigh, r_thigh | r_hip |
| right_knee, r_knee | r_knee |
| right_ankle, r_ankle | r_ankle |
| right_foot, r_foot | r_toe |

## Custom Mapping

If automatic mapping doesn't work for your skeleton, you can provide custom mappings:

```javascript
const customMappings = {
  'my_custom_bone_name': 'l_clavicle',
  'special_joint': 'r_wrist'
};

const result = UniversalSkeletonConverter.convert(universalSkeleton, customMappings);
```

## Exporting from Bitruvius

You can also export Bitruvius skeletons to universal formats:

### Universal JSON Format
```javascript
import { UniversalSkeletonExporter } from './engine/import/exportUniversal';

const universalJSON = UniversalSkeletonExporter.exportToJSON(state, 'My Character');
```

### CSV Format
```javascript
const csvData = UniversalSkeletonExporter.exportToCSV(state);
```

## Integration Examples

### Graphite.art Integration

1. In Graphite.art, create your skeleton
2. Export as JSON (File → Export → JSON)
3. Import the file into Bitruvius using the Import dialog
4. The system will automatically detect the Graphite.art format and convert it

### Custom Application Integration

For your own applications, export skeletal data in this simple format:

```json
{
  "name": "My Character",
  "bones": [
    {
      "id": "bone_id",
      "name": "Bone Name",
      "parent": "parent_bone_id",
      "x": 100,
      "y": 200,
      "angle": 45,
      "length": 50
    }
  ]
}
```

## Error Handling

The import system provides detailed feedback:

- **Warnings**: Non-critical issues (missing parents, invalid coordinates)
- **Errors**: Critical issues that prevent import (cycles, missing root bone)
- **Statistics**: Number of bones imported, mapped, and unmapped

## Best Practices

1. **Use descriptive bone names** that match the default mapping patterns
2. **Maintain a clean hierarchy** with no cycles
3. **Set a clear root bone** with no parent
4. **Validate coordinates** before export to ensure they're numeric
5. **Test with a small subset** of bones first, then import the full skeleton

## API Reference

### UniversalSkeletonConverter

```typescript
static convert(
  universalSkeleton: UniversalSkeleton,
  customMappings?: Record<string, string>
): ImportResult
```

Converts a universal skeleton to Bitruvius joints.

### SkeletonImporter

```typescript
static async importFromFile(file: File): Promise<ImportResult>
static async importFromClipboard(): Promise<ImportResult>
```

High-level import methods for files and clipboard data.

### UniversalSkeletonExporter

```typescript
static exportToJSON(state: SkeletonState, name?: string): string
static exportToCSV(state: SkeletonState): string
```

Export Bitruvius skeletons to universal formats.

## Troubleshooting

### Bones Not Mapping
- Check if bone names match the default mapping patterns
- Provide custom mappings for non-standard names
- Ensure bone names are spelled correctly

### Import Fails
- Verify JSON syntax is valid
- Check that all parent references exist
- Ensure there are no circular references

### Coordinates Wrong
- Verify coordinate system (Y-up vs Y-down)
- Check unit scale (pixels vs meters)
- Review transform values in source data

## Future Enhancements

- Support for more formats (XML, binary)
- Visual mapping interface for custom bone assignments
- Animation data import/export
- Batch processing of multiple skeletons
- Integration with more third-party applications
