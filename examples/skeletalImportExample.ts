/**
 * Example: Importing a skeleton from Graphite.art
 * 
 * This example demonstrates how to use the Universal Skeletal Import System
 * to import skeletal data from external applications.
 */

import { SkeletonImporter } from '../client/src/engine/import/skeletonImporter';
import { UniversalSkeletonConverter } from '../client/src/engine/import/universalSkeleton';
import { UniversalSkeletonFactory } from '../client/src/engine/import/universalSkeleton';

// Example 1: Import from a Graphite.art JSON file
async function importFromGraphiteArt() {
  // This would be the JSON content exported from Graphite.art
  const graphiteArtData = {
    name: "My Character",
    bones: [
      {
        id: "root",
        name: "Root",
        parent: null,
        x: 0,
        y: 0,
        angle: 0,
        length: 10
      },
      {
        id: "left_shoulder",
        name: "Left Shoulder",
        parent: "root",
        x: -50,
        y: -100,
        angle: 45,
        length: 30
      },
      {
        id: "left_elbow",
        name: "Left Elbow",
        parent: "left_shoulder",
        x: -80,
        y: -150,
        angle: -30,
        length: 25
      },
      {
        id: "right_shoulder",
        name: "Right Shoulder",
        parent: "root",
        x: 50,
        y: -100,
        angle: -45,
        length: 30
      },
      {
        id: "right_elbow",
        name: "Right Elbow",
        parent: "right_shoulder",
        x: 80,
        y: -150,
        angle: 30,
        length: 25
      }
    ]
  };

  // Convert to universal format
  const universalSkeleton = UniversalSkeletonFactory.fromJSON(graphiteArtData);
  
  // Convert to Bitruvius joints
  const result = UniversalSkeletonConverter.convert(universalSkeleton);
  
  console.log('Import Results:', result);
  console.log('Success:', result.success);
  console.log('Bones Imported:', result.metadata.bonesImported);
  console.log('Bones Mapped:', result.metadata.bonesMapped);
  console.log('Warnings:', result.warnings);
  console.log('Errors:', result.errors);
  
  return result;
}

// Example 2: Import with custom mappings
async function importWithCustomMappings() {
  const customSkeletonData = {
    name: "Custom Character",
    bones: [
      {
        id: "torso_main",
        name: "Main Torso",
        parent: null,
        x: 0,
        y: 0,
        angle: 0,
        length: 50
      },
      {
        id: "arm_left_upper",
        name: "Left Upper Arm",
        parent: "torso_main",
        x: -30,
        y: -20,
        angle: 90,
        length: 30
      },
      {
        id: "arm_left_lower",
        name: "Left Lower Arm",
        parent: "arm_left_upper",
        x: -30,
        y: -50,
        angle: 45,
        length: 25
      }
    ]
  };

  const universalSkeleton = UniversalSkeletonFactory.fromJSON(customSkeletonData);
  
  // Custom mappings for non-standard bone names
  const customMappings = {
    'torso_main': 'sternum',
    'arm_left_upper': 'l_bicep',
    'arm_left_lower': 'l_elbow'
  };
  
  const result = UniversalSkeletonConverter.convert(universalSkeleton, customMappings);
  
  console.log('Custom Mapping Results:', result);
  return result;
}

// Example 3: Import from CSV
function importFromCSV() {
  const csvData = `bone_id,name,parent_id,x,y,angle,length
root,Root,,0,0,0,0
left_shoulder,Left Shoulder,root,-50,-100,0,30
left_elbow,Left Elbow,left_shoulder,-80,-150,45,25
right_shoulder,Right Shoulder,root,50,-100,0,30
right_elbow,Right Elbow,right_shoulder,80,-150,-45,25`;

  // Create a mock file object (in real usage, this would come from file input)
  const file = new File([csvData], 'skeleton.csv', { type: 'text/csv' });
  
  return SkeletonImporter.importFromFile(file);
}

// Example 4: Export Bitruvius skeleton to universal format
function exportToUniversalFormat(bitruviusState: any) {
  const { UniversalSkeletonExporter } = require('../client/src/engine/import/exportUniversal');
  
  // Export to universal JSON
  const universalJSON = UniversalSkeletonExporter.exportToJSON(bitruviusState, 'My Character');
  console.log('Universal JSON:', universalJSON);
  
  // Export to CSV
  const csvData = UniversalSkeletonExporter.exportToCSV(bitruviusState);
  console.log('CSV Data:', csvData);
  
  return { universalJSON, csvData };
}

// Example 5: Complete workflow
async function completeWorkflow() {
  try {
    // Step 1: Import from external source
    console.log('Step 1: Importing skeleton...');
    const importResult = await importFromGraphiteArt();
    
    if (!importResult.success) {
      console.error('Import failed:', importResult.errors);
      return;
    }
    
    // Step 2: Apply to Bitruvius state (in real usage)
    console.log('Step 2: Applying to Bitruvius state...');
    // const newState = SkeletonImporter.applyToState(importResult, currentState);
    
    // Step 3: Export back to universal format
    console.log('Step 3: Exporting to universal format...');
    // const exportData = exportToUniversalFormat(newState);
    
    console.log('Workflow completed successfully!');
    
  } catch (error) {
    console.error('Workflow failed:', error);
  }
}

// Run the examples
if (require.main === module) {
  completeWorkflow();
}

export {
  importFromGraphiteArt,
  importWithCustomMappings,
  importFromCSV,
  exportToUniversalFormat,
  completeWorkflow
};
