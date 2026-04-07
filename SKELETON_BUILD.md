# Pyxl Puppet DragonBones-Style Skeleton - Exact Proportions

## Overview
The Bitruvius skeleton features **exact bone lengths** from the sprite sheets with **collar socket holes** for shoulder connections, using the Pyxl Puppet DragonBones model with **waist as the root** and **precise joint separations**.

## 🦴 **Exact Bone Lengths from Sprite Sheets**

### **Core Spine Chain - Exact Proportions**
```
waist (root) → torso → collar → head socket
```

- **Waist → Torso**: 2.8 units (exact spine length)
- **Torso → Collar**: 2.4 units (exact upper chest length)  
- **Collar → Head Socket**: 1.8 units (exact neck length)
- **Head**: Not a joint - socket for mask attachment

### **Collar with Socket Holes - Exact Shoulder Positions**
```
collar → bicep_l → forearm_l → hand_l
collar → bicep_r → forearm_r → hand_r
```

- **Collar Socket Holes**: Built-in shoulder sockets at exact positions
- **Collar → Bicep_L**: (-2.2, 0.1) - exact left shoulder socket position
- **Collar → Bicep_R**: (2.2, 0.1) - exact right shoulder socket position
- **Bicep → Forearm**: 2.5 units (exact upper arm length)
- **Forearm → Hand**: 2.0 units (exact forearm length)

### **Leg Chain - Exact Proportions**
```
waist → thigh_l → shin_l → foot_l
waist → thigh_r → shin_r → foot_r
```

- **Waist → Thigh_L**: (-1.0, 0.8) - exact left hip position
- **Waist → Thigh_R**: (1.0, 0.8) - exact right hip position
- **Thigh → Shin**: 4.2 units (exact upper leg length)
- **Shin → Foot**: 3.2 units (exact lower leg length)

## 🎯 **Collar Socket System**

### **Key Innovation**
- **No clavicle bones needed** - Collar itself acts as the socket parent
- **Direct arm attachment** - Biceps connect directly to collar's built-in sockets
- **Socket easing** - Gradual magnetic force guides arms to natural positions
- **Simplified hierarchy** - Cleaner joint structure with better performance

### **Socket Easing Benefits**
- **Magnetic guidance** - 0.7 strength with 1.5 unit radius
- **Smooth transitions** - 0.8 second ease-in-out cubic animation
- **Natural positioning** - Arms smoothly slide into optimal socket positions
- **Configurable** - Strength, radius, and timing adjustable

## 📏 **Exact Bone Length Specifications**

### **No Offsets - Precise Joint Separations**
- **Exact proportions** from sprite sheets
- **No nearby joint offsets** - precise positioning required
- **Socket holes in collar** - represent actual shoulder attachment points
- **Head as socket** - not a joint, but mask attachment point

### **Bone Length Validation**
- **Spine segments**: Match sprite sheet proportions exactly
- **Arm segments**: Precise upper arm and forearm lengths
- **Leg segments**: Exact thigh and shin measurements
- **Shoulder positions**: Collar socket holes at precise coordinates

### **Socket System Architecture**
- **Collar holes**: Physical socket representations for shoulders
- **Direct attachment**: No intermediate bones between collar and arms
- **Mask socket**: Head position serves as mask attachment point
- **Overlap meeting**: Joints and sockets meet at exact specified points

## Skeleton Assembly Instructions

### Step 1: Create Main Body
1. Place **root** at center/bottom
2. Attach **torso** above root (vertical spine, extended upward)
3. Attach **head** above torso (neck connection)
4. Attach **navel** below root (central hub position)

### Step 2: Create Rigid Upper Body Structure
5. Connect **left_clavicle** to navel (left upper chest)
6. Connect **right_clavicle** to navel (right upper chest)
7. Attach **left_shoulder** to left_clavicle (left shoulder socket)
8. Attach **right_shoulder** to right_clavicle (right shoulder socket)

### Step 3: Create Complete Left Arm
9. Connect **left_arm** to left_shoulder (upper arm connection)
10. Attach **left_elbow** to left_arm (forearm connection)
11. Attach **left_hand** to left_elbow (hand connection)

### Step 4: Create Complete Right Arm
12. Connect **right_arm** to right_shoulder (upper arm connection)
13. Attach **right_elbow** to right_arm (forearm connection)
14. Attach **right_hand** to right_elbow (hand connection)

### Step 5: Create Complete Left Leg
13. Connect **thigh_l** to waist (left thigh connection)
14. Attach **shin_l** to thigh_l (left shin connection)
15. Attach **foot_l** to shin_l (left foot connection)

### Step 6: Create Complete Right Leg
16. Connect **thigh_r** to waist (right thigh connection)
17. Attach **shin_r** to thigh_r (right shin connection)
18. Attach **foot_r** to shin_r (right foot connection)

## Dynamic Relationships

### Waist as Core Controller
- **Animating waist** moves the entire puppet (torso + collar + clavicles + head + arms + legs)
- **Root of all motion** - everything follows waist rotation/position

### Torso Independence
- **Animating torso** moves collar + clavicles + head + both arms
- **Torso twist** - upper body rotates independently of waist
- **Maintains leg stability** - legs stay connected to waist

### Rigid Collar Precision
- **Animating collar** moves clavicles + head + arms only
- **Chest independent tilt** - fine control of shoulder area
- **Clavicles move with collar** - maintains shoulder width
- **Doesn't add height** - collar sits AT top of torso, not above it

### Sliding Arm Sockets
- **Arms attach to clavicles** - can slide between socket positions
- **Dimensional adjustments** - bicep positions can be modified for different body types
- **Socket flexibility** - biceps can be repositioned relative to clavicles
- **Maintain structure** - arm chains remain intact while socket positions adjust

## Calibrated IK/FK/Physics

### FK Follow Degrees
- **Spine Chain**: 75° (moderate flexibility for natural movement)
  - waist → torso
  - torso → collar  
  - collar → head

- **Rigid Collar**: 65° (stable shoulder width)
  - collar → clavicle_l
  - collar → clavicle_r

- **Arm Chains**: 85° (high flexibility for expressive posing)
  - clavicle_l/r → bicep_l/r
  - bicep_l/r → forearm_l/r
  - forearm_l/r → hand_l/r

- **Leg Chains**: 
  - Hip connections: 60° (moderate stability)
    - waist → thigh_l/r
  - Leg segments: 80° (high flexibility for dynamic poses)
    - thigh_l/r → shin_l/r
    - shin_l/r → foot_l/r

### Physics Settings
- **Control Mode**: Cardboard (FK-heavy default)
- **Rigidity**: Cardboard (most rigid setting)
- **Snappiness**: 1.0 (maximum for crisp rigid movement)
- **Physics Rigidity**: 0 (rigid by default)
- **Stretch Enabled**: False (preserve bone lengths)

## Visual Design

### Bone Shapes
- **Spine**: Cylinder (rigid structure)
- **Collar Bones**: Cylinder (rigid shoulder structure)
- **Neck**: Trapezoid inverted (tapered connection)
- **Limbs**: Tapered (natural joint connections)
- **Stretch Mode**: Rigid (maintains proportions)

### Z-Order (Back → Front)
1. Feet (foot_l, foot_r)
2. Shins (shin_l, shin_r)  
3. Thighs (thigh_l, thigh_r)
4. Waist
5. Torso
6. Hands (hand_l, hand_r)
7. Forearms (forearm_l, forearm_r)
8. Biceps (bicep_l, bicep_r)
9. Clavicles (clavicle_l, clavicle_r) ← **Part of rigid collar**
10. Collar ← **In front of torso** (closer to camera)
11. Head

## Technical Implementation

### Joint Structure
- **18 total joints** (1 root + 17 child joints)
- **Rigid collar**: clavicle_l + clavicle_r as part of collar structure
- **Mirrored pairs** for symmetry (clavicle_l/r, bicep_l/r, etc.)
- **End effectors**: head, hand_l, hand_r, foot_l, foot_r

### Connection System
- **17 connections** (parent → child relationships)
- **Rigid stretch mode** for all connections
- **Calibrated FK follow degrees** per connection type

### Root System
- **Primary root**: waist (controls entire puppet)
- **Secondary control**: torso (upper body)
- **Tertiary control**: collar (chest/shoulders)
- **Socket control**: clavicles (shoulder width/arm positions)

## Animation Benefits

### Hierarchical Control
1. **Waist animation** → full body movement
2. **Torso animation** → upper body twist
3. **Collar animation** → chest/shoulder precision
4. **Clavicle animation** → shoulder width adjustment
5. **Individual limbs** → independent arm/leg movement

### Natural Movement
- **Spine flexibility**: 75° allows natural torso bending
- **Rigid collar**: 65° maintains stable shoulder structure
- **Arm expressiveness**: 85° enables dynamic posing
- **Leg stability**: 60° hip + 80° leg for grounded movement
- **Head tracking**: Follows collar naturally

### Socket Easing - Calm Magnetic Force
- **Gradual ease-in**: Arms smoothly slide into socket positions
- **Magnetic force**: 0.7 strength with 1.5 unit radius
- **Smooth animation**: 0.8 second ease-in-out cubic transition
- **Natural feel**: Like a calm magnetic force pulling arms to optimal positions

### Socket Easing Behavior
- **Within radius**: Arms experience gradual magnetic pull toward socket
- **Outside radius**: No magnetic effect, arms move freely
- **Smooth transition**: Ease-in-out cubic creates natural movement
- **Configurable**: Strength, radius, and timing can be adjusted

### Sliding Socket Capability
- **Dimensional flexibility**: Arms can slide between socket positions
- **Body type adaptation**: Socket positions adjust for different builds
- **Shoulder width control**: Clavicles create adjustable shoulder structure
- **Maintain articulation**: Arm chains remain functional while sockets slide
- **Magnetic assistance**: Socket easing helps guide arms to natural positions

### Rigid Structure
- **Cardboard mode**: Prevents unrealistic deformation
- **FK-first**: Maintains artistic intent
- **No stretching**: Preserves proportions
- **Stable collar**: Maintains shoulder structure during animation

## Joint Count Breakdown

| Category | Joints | Purpose |
|----------|--------|---------|
| Core Spine | 4 | waist, torso, collar, head |
| Rigid Collar | 2 | clavicle_l, clavicle_r |
| Left Arm | 3 | bicep_l, forearm_l, hand_l |
| Right Arm | 3 | bicep_r, forearm_r, hand_r |
| Left Leg | 3 | thigh_l, shin_l, foot_l |
| Right Leg | 3 | thigh_r, shin_r, foot_r |
| **Total** | **18** | **Complete puppet with rigid collar** |

## Migration Notes

This rigid collar structure enhances the previous Pyxl puppet system:

- **Added clavicles**: Rigid collar bones for shoulder structure
- **Sliding sockets**: Arms can adjust positions relative to clavicles
- **Enhanced stability**: 65° FK for rigid collar connections
- **Dimensional control**: Socket positions for body type adjustments
- **Maintained hierarchy**: Clear control system with waist → torso → collar → clavicles

The new structure provides **better shoulder definition**, **dimensional flexibility**, and **enhanced control** while maintaining the **cardboard-like rigidity** for artistic consistency.

## Socket Sliding Usage

### Adjusting Shoulder Width
1. **Select clavicle_l/r** - modify baseOffset.x values
2. **Shoulder width** - increase/decrease distance between clavicles
3. **Arm positions** - biceps follow clavicle positions automatically

### Body Type Adaptation
1. **Narrow shoulders** - bring clavicles closer together
2. **Wide shoulders** - spread clavicles further apart
3. **Arm positioning** - adjust bicep offsets from clavicles
4. **Symmetry** - maintain mirror relationships for balance

### Animation Control
- **Clavicle rotation** - affects shoulder angle and arm position
- **Socket sliding** - allows dynamic shoulder adjustments during animation
- **Arm independence** - arms remain fully articulated while sockets slide
- **Collar stability** - rigid structure maintains upper body integrity
- **Magnetic guidance** - socket easing provides smooth transitions to natural positions

## 🔧 **Socket Easing Configuration**

### **Default Settings**
- **Strength**: 0.7 (moderate magnetic pull)
- **Radius**: 1.5 units (magnetic field size)
- **Ease-in Time**: 0.8 seconds (smooth transition duration)
- **Enabled**: true for clavicle → bicep connections

### **Configuration Properties**
```typescript
socketEasing: {
  enabled: boolean;     // Enable/disable magnetic force
  strength: number;     // 0-1, magnetic pull strength
  radius: number;       // Distance within which force applies
  easeInTime: number;   // Seconds for smooth animation
}
```

### **Adjustment Guidelines**
- **Stronger magnetic force**: Increase strength (0.8-1.0) for more guided movement
- **Weaker magnetic force**: Decrease strength (0.3-0.6) for more freedom
- **Larger radius**: Increase radius (2.0-3.0) for wider magnetic field
- **Faster animation**: Decrease easeInTime (0.3-0.5) for quicker response
- **Slower animation**: Increase easeInTime (1.0-1.5) for smoother transitions
