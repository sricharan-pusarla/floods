from flask import Flask, render_template, jsonify, request
import copy
import os


app = Flask(__name__, template_folder='templates', static_folder='static')


# ============================================================
# BANKER'S ALGORITHM IMPLEMENTATION FOR FLOOD PREVENTION
# ============================================================
# Mapping:
#   Processes   -> Reservoirs
#   Resources   -> Drainage Channels
#   Allocation  -> Current water being drained (allocated drainage)
#   Max         -> Maximum drainage each reservoir might need
#   Available   -> Currently available drainage capacity
#   Need        -> Additional drainage each reservoir may request
# ============================================================

def calculate_need(max_matrix, allocation_matrix, num_reservoirs, num_drains):
    """Calculate the Need matrix: Need = Max - Allocation"""
    need = []
    for i in range(num_reservoirs):
        row = []
        for j in range(num_drains):
            row.append(max_matrix[i][j] - allocation_matrix[i][j])
        need.append(row)
    return need


def is_safe_state(available, max_matrix, allocation_matrix, num_reservoirs, num_drains):
    """
    Banker's Algorithm: Determines if the system is in a safe state.
    Returns (is_safe, safe_sequence, step_details)
    """
    need = calculate_need(max_matrix, allocation_matrix, num_reservoirs, num_drains)
    
    work = available[:]  # Available drainage capacity (work vector)
    finish = [False] * num_reservoirs
    safe_sequence = []
    step_details = []

    while len(safe_sequence) < num_reservoirs:
        found = False
        for i in range(num_reservoirs):
            if not finish[i]:
                # Check if Need[i] <= Work for all drainage channels
                can_proceed = True
                for j in range(num_drains):
                    if need[i][j] > work[j]:
                        can_proceed = False
                        break

                if can_proceed:
                    # This reservoir can safely release water
                    step = {
                        "reservoir": i,
                        "reservoir_name": f"Reservoir R{i}",
                        "work_before": work[:],
                        "need": need[i][:],
                        "allocation": allocation_matrix[i][:],
                    }

                    # Simulate: reservoir finishes draining, resources returned
                    new_work = []
                    for j in range(num_drains):
                        new_work.append(work[j] + allocation_matrix[i][j])
                    work = new_work

                    step["work_after"] = work[:]
                    step_details.append(step)

                    finish[i] = True
                    safe_sequence.append(i)
                    found = True
                    break  # Restart search

        if not found:
            # No reservoir can proceed — UNSAFE (flooding risk!)
            unfinished = [i for i in range(num_reservoirs) if not finish[i]]
            return False, safe_sequence, step_details, need, unfinished

    return True, safe_sequence, step_details, need, []


def simulate_release_request(available, max_matrix, allocation_matrix,
                              num_reservoirs, num_drains,
                              reservoir_id, request_vector):
    """
    Simulate a water release request from a specific reservoir.
    Check if granting the request keeps system in safe state.
    """
    need = calculate_need(max_matrix, allocation_matrix, num_reservoirs, num_drains)

    # Step 1: Check if request <= need
    for j in range(num_drains):
        if request_vector[j] > need[reservoir_id][j]:
            return {
                "granted": False,
                "reason": f"Request exceeds declared maximum need for drainage channel D{j}. "
                          f"Requested: {request_vector[j]}, Remaining Need: {need[reservoir_id][j]}",
                "is_safe": False,
                "safe_sequence": [],
                "steps": [],
                "need_matrix": need,
                "flood_risk_reservoirs": []
            }

    # Step 2: Check if request <= available
    for j in range(num_drains):
        if request_vector[j] > available[j]:
            return {
                "granted": False,
                "reason": f"Not enough available drainage capacity for channel D{j}. "
                          f"Requested: {request_vector[j]}, Available: {available[j]}",
                "is_safe": False,
                "safe_sequence": [],
                "steps": [],
                "need_matrix": need,
                "flood_risk_reservoirs": []
            }

    # Step 3: Pretend to allocate
    new_available = available[:]
    new_allocation = copy.deepcopy(allocation_matrix)

    for j in range(num_drains):
        new_available[j] -= request_vector[j]
        new_allocation[reservoir_id][j] += request_vector[j]

    # Step 4: Check safety
    is_safe, safe_seq, steps, new_need, unfinished = is_safe_state(
        new_available, max_matrix, new_allocation, num_reservoirs, num_drains
    )

    return {
        "granted": is_safe,
        "reason": "System remains in SAFE state. Water release approved." if is_safe
                  else "UNSAFE! Granting this request could lead to FLOODING. Request DENIED.",
        "is_safe": is_safe,
        "safe_sequence": [f"R{i}" for i in safe_seq],
        "steps": steps,
        "need_matrix": new_need,
        "new_available": new_available,
        "new_allocation": new_allocation,
        "flood_risk_reservoirs": [f"R{i}" for i in unfinished]
    }


# ============================================================
# PRESET SCENARIOS (Synthetic Data)
# ============================================================

PRESETS = {
    "normal_monsoon": {
        "name": "Normal Monsoon Season",
        "description": "5 reservoirs sharing 3 drainage channels during normal rainfall. System should be in safe state.",
        "num_reservoirs": 5,
        "num_drains": 3,
        "drain_names": ["Main Canal", "River Outlet", "Storm Drain"],
        "reservoir_names": ["Reservoir R0 (Lake Alpha)", "Reservoir R1 (Dam Beta)", 
                           "Reservoir R2 (Tank Gamma)", "Reservoir R3 (Pond Delta)", 
                           "Reservoir R4 (Basin Epsilon)"],
        "reservoir_water_levels": [75, 60, 85, 40, 55],  # percentage full
        "rainfall_intensity": "Moderate (50mm/day)",
        "allocation": [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
            [2, 1, 1],
            [0, 0, 2],
        ],
        "max_need": [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
            [2, 2, 2],
            [4, 3, 3],
        ],
        "available": [3, 3, 2],
    },
    "heavy_rainfall": {
        "name": "Heavy Rainfall Alert",
        "description": "4 reservoirs nearing capacity with limited drainage during heavy rain. Potentially unsafe.",
        "num_reservoirs": 4,
        "num_drains": 3,
        "drain_names": ["Main Canal", "River Outlet", "Emergency Spillway"],
        "reservoir_names": ["Reservoir R0 (Upper Dam)", "Reservoir R1 (City Lake)", 
                           "Reservoir R2 (Valley Tank)", "Reservoir R3 (Hill Reservoir)"],
        "reservoir_water_levels": [90, 85, 95, 80],
        "rainfall_intensity": "Heavy (120mm/day)",
        "allocation": [
            [3, 2, 1],
            [2, 3, 1],
            [2, 1, 3],
            [1, 2, 2],
        ],
        "max_need": [
            [6, 5, 4],
            [5, 6, 4],
            [5, 4, 6],
            [4, 5, 5],
        ],
        "available": [1, 1, 1],
    },
    "flash_flood": {
        "name": "Flash Flood Emergency",
        "description": "3 reservoirs at critical levels with minimal drainage available. High flood risk!",
        "num_reservoirs": 3,
        "num_drains": 2,
        "drain_names": ["Primary Outlet", "Overflow Channel"],
        "reservoir_names": ["Reservoir R0 (Mountain Dam)", "Reservoir R1 (Plains Lake)", 
                           "Reservoir R2 (Coastal Tank)"],
        "reservoir_water_levels": [98, 95, 92],
        "rainfall_intensity": "Extreme (200mm/day)",
        "allocation": [
            [4, 3],
            [3, 4],
            [2, 2],
        ],
        "max_need": [
            [7, 6],
            [6, 7],
            [5, 5],
        ],
        "available": [1, 0],
    },
    "custom": {
        "name": "Custom Scenario",
        "description": "Configure your own scenario with custom values.",
        "num_reservoirs": 3,
        "num_drains": 3,
        "drain_names": ["Drain D0", "Drain D1", "Drain D2"],
        "reservoir_names": ["Reservoir R0", "Reservoir R1", "Reservoir R2"],
        "reservoir_water_levels": [50, 50, 50],
        "rainfall_intensity": "Custom",
        "allocation": [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
        ],
        "max_need": [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
        ],
        "available": [3, 3, 2],
    }
}


# ============================================================
# FLASK ROUTES
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/presets", methods=["GET"])
def get_presets():
    """Return list of available preset scenarios"""
    preset_list = {}
    for key, val in PRESETS.items():
        preset_list[key] = {
            "name": val["name"],
            "description": val["description"],
        }
    return jsonify(preset_list)


@app.route("/api/preset/<preset_name>", methods=["GET"])
def get_preset(preset_name):
    """Return full data for a specific preset"""
    if preset_name in PRESETS:
        return jsonify(PRESETS[preset_name])
    return jsonify({"error": "Preset not found"}), 404


@app.route("/api/check_safety", methods=["POST"])
def check_safety():
    """Check if current state is safe using Banker's Algorithm"""
    data = request.json

    num_reservoirs = int(data["num_reservoirs"])
    num_drains = int(data["num_drains"])
    available = [int(x) for x in data["available"]]
    allocation = [[int(x) for x in row] for row in data["allocation"]]
    max_need = [[int(x) for x in row] for row in data["max_need"]]

    # Validate inputs
    validation = validate_inputs(num_reservoirs, num_drains, available, allocation, max_need)
    if validation:
        return jsonify({"error": validation}), 400

    need = calculate_need(max_need, allocation, num_reservoirs, num_drains)
    is_safe, safe_seq, steps, _, unfinished = is_safe_state(
        available, max_need, allocation, num_reservoirs, num_drains
    )

    # Format steps for frontend
    formatted_steps = []
    for s in steps:
        formatted_steps.append({
            "reservoir": s["reservoir_name"],
            "work_before": s["work_before"],
            "need": s["need"],
            "allocation": s["allocation"],
            "work_after": s["work_after"],
        })

    return jsonify({
        "is_safe": is_safe,
        "safe_sequence": [f"R{i}" for i in safe_seq],
        "steps": formatted_steps,
        "need_matrix": need,
        "flood_risk_reservoirs": [f"R{i}" for i in unfinished],
        "message": "✅ SAFE STATE: All reservoirs can drain without flooding."
                   if is_safe else
                   "⚠️ UNSAFE STATE: Flooding risk detected! Not all reservoirs can safely drain."
    })


@app.route("/api/request_release", methods=["POST"])
def request_release():
    """Simulate a water release request from a reservoir"""
    data = request.json

    num_reservoirs = int(data["num_reservoirs"])
    num_drains = int(data["num_drains"])
    available = [int(x) for x in data["available"]]
    allocation = [[int(x) for x in row] for row in data["allocation"]]
    max_need = [[int(x) for x in row] for row in data["max_need"]]
    reservoir_id = int(data["reservoir_id"])
    request_vector = [int(x) for x in data["request"]]

    # Validate
    validation = validate_inputs(num_reservoirs, num_drains, available, allocation, max_need)
    if validation:
        return jsonify({"error": validation}), 400

    if reservoir_id < 0 or reservoir_id >= num_reservoirs:
        return jsonify({"error": "Invalid reservoir ID"}), 400

    if len(request_vector) != num_drains:
        return jsonify({"error": "Request vector size mismatch"}), 400

    result = simulate_release_request(
        available, max_need, allocation,
        num_reservoirs, num_drains,
        reservoir_id, request_vector
    )

    # Format steps
    formatted_steps = []
    for s in result.get("steps", []):
        formatted_steps.append({
            "reservoir": s["reservoir_name"],
            "work_before": s["work_before"],
            "need": s["need"],
            "allocation": s["allocation"],
            "work_after": s["work_after"],
        })
    result["steps"] = formatted_steps

    return jsonify(result)


def validate_inputs(num_reservoirs, num_drains, available, allocation, max_need):
    """Validate matrix dimensions and values"""
    if num_reservoirs <= 0 or num_drains <= 0:
        return "Number of reservoirs and drains must be positive"

    if len(available) != num_drains:
        return f"Available vector should have {num_drains} elements"

    if len(allocation) != num_reservoirs:
        return f"Allocation matrix should have {num_reservoirs} rows"

    if len(max_need) != num_reservoirs:
        return f"Max need matrix should have {num_reservoirs} rows"

    for i in range(num_reservoirs):
        if len(allocation[i]) != num_drains:
            return f"Allocation row {i} should have {num_drains} elements"
        if len(max_need[i]) != num_drains:
            return f"Max need row {i} should have {num_drains} elements"
        for j in range(num_drains):
            if allocation[i][j] < 0 or max_need[i][j] < 0:
                return "Values cannot be negative"
            if allocation[i][j] > max_need[i][j]:
                return f"Allocation[{i}][{j}] ({allocation[i][j]}) exceeds Max[{i}][{j}] ({max_need[i][j]})"

    for j in range(num_drains):
        if available[j] < 0:
            return "Available values cannot be negative"

    return None


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)