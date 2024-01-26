// Hook for init event
Hooks.on("init", () => {
    console.log("RTS Controls initialized");

    // Create a setting for the camera panning control
    game.settings.register("rtscontrols", "cameraPanning", {
        name: "Camera Panning",
        hint: "Enable camera panning when the token moves.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
    });

    // Setting for the destination circle colour with a dropdown menu
    game.settings.register("rtscontrols", "destinationCircleColor", {
        name: "Destination Circle Colour",
        hint: "Set the colour of the destination circle by selecting a color name.",
        scope: "client",
        config: true,
        type: String,
        choices: {           // Expanded options in the select menu with human-readable names
            "#ff0000": "Red",
            "#00ff00": "Green",
            "#0000ff": "Blue",
            "#ffff00": "Yellow",
            "#ff00ff": "Magenta",
            "#00ffff": "Cyan",
            "#ffffff": "White",
            "#000000": "Black",
            "#800000": "Maroon",
            "#808000": "Olive",
            "#008000": "Dark Green",
            "#800080": "Purple",
            "#008080": "Teal",
            "#c0c0c0": "Silver",
            "#ff6347": "Tomato",
            "#40e0d0": "Turquoise",
            "#ee82ee": "Violet",
            "#f5deb3": "Wheat",
            "#ffa500": "Orange",
            "#a52a2a": "Brown",
            "#87ceeb": "Sky Blue",
            "#6a5acd": "Slate Blue",
            "#708090": "Slate Gray",
            "#2e8b57": "Sea Green",
            "#d2b48c": "Tan",
            "#ff69b4": "Hot Pink"
        },
        default: "Red", // Default value is the name of the color
    });
});



let rightClickStartTime = 0;
const clickThreshold = 100; // milliseconds

document.addEventListener("mousedown", (event) => {
    // Check if the right mouse button was pressed
    if (event.button === 2) {
        rightClickStartTime = Date.now();
    }
});

document.addEventListener("mouseup", (event) => {
    // Check if the right mouse button was released
    if (event.button === 2) {
        const clickDuration = Date.now() - rightClickStartTime;
        if (clickDuration < clickThreshold) {
            console.log("Detected a click");
            // Handle click event here
        } else {
            console.log("Detected a pan");
            // Handle pan event here
        }
    }
});





async function findPath(start, end) {
    // Check if start and end are properly defined
    if (!start || start.x === undefined || start.y === undefined) {
        console.error('Invalid start object:', start);
        return null;
    }
    if (!end || end.x === undefined || end.y === undefined) {
        console.error('Invalid end object:', end);
        return null;
    }

    // Use the start coordinates directly since they should already be in grid coordinates
    const from = { x: start.x, y: start.y };

    // Define the options object
    const options = { interpolate: true }; // Now the pathfinder will emit a waypoint for every grid cell

    console.log(`Calculating path from (${from.x}, ${from.y}) to (${end.x}, ${end.y})`);

    try {
        const pathResult = await routinglib.calculatePath(from, end, options);
        console.log(`Path result:`, pathResult);

        if (pathResult && pathResult.path) {
            console.log(`Path found:`, pathResult.path);
            return { path: pathResult.path, cost: pathResult.cost };
        } else {
            console.warn(`No path or empty path found`);
            return null;
        }
    } catch (error) {
        console.error(`Error during path calculation:`, error);
        return null;
    }
}

class GridSpaceManager {
    constructor() {
        this.reservations = new Map(); // key: gridSpace JSON string, value: {tokenId, tick}
    }

    reserveSpace(gridSpace, tokenId, tick) {
        //    const key = JSON.stringify(gridSpace);
        // this.reservations.set(key, { tokenId, tick });
    }

    releaseSpace(gridSpace) {
        const key = JSON.stringify(gridSpace);
        this.reservations.delete(key);
    }

    getGridSpaceFromToken(token) {
        console.log(`Token pixel coordinates: x=${token.x}, y=${token.y}`);
        const gridSize = canvas.grid.size;
        const fromX = Math.floor(token.x / gridSize);
        const fromY = Math.floor(token.y / gridSize);
        return { x: fromX, y: fromY };
    }

    // Override the isReserved method
    isReserved(gridSpace, tokenId, tick) {
        const key = JSON.stringify(gridSpace);
        const reservation = this.reservations.get(key);
        console.log(`Checking reservation for space ${key}:`, reservation);
        // Check if the space is reserved by a different token or at a future tick
        const isReserved = reservation && (reservation.tokenId !== tokenId && tick < reservation.tick);
        console.log(`Space ${key} is reserved: ${isReserved}`);
        return isReserved;
    }
}

const gridSpaceManager = new GridSpaceManager();

class MovementManager {
    constructor() {
        this.movements = new Map();
        this.tickRate = 500;
        this.tickInterval = null;
    }

    startMovement(token, path) {
        console.log(`Path to be calculated for token ${token.name}:`, path);
        console.log('Selected token:', token);
        console.log(`Starting movement for token ${token.name} with ID ${token.id}`);

        // Calculate all grid spaces for the path
        const gridSpaces = GridSpaceCalculator.calculateGridSpacesForPath(path);
        console.log(`Calculated grid spaces for token ${token.name}:`, gridSpaces);

        // Check if there are any grid spaces to move to
        if (gridSpaces.length === 0) {
            console.warn(`No grid spaces to move to for token ${token.name} with ID ${token.id}`);
            return; // Do not start movement if there are no grid spaces
        }

        // Reserve grid spaces for the new movement
        gridSpaces.forEach((space, index) => {
            console.log(`Reserving space for token ${token.name} at index ${index}:`, space);
            gridSpaceManager.reserveSpace(space, token.id, index);
        });

        // Visualize the path and destination
        const destination = path[path.length - 1];
        const movementColor = 0xff0000; // Define color or retrieve it based on token properties
        visualManager.drawPathLine(token.id, gridSpaces, movementColor);
        visualManager.drawDestinationCircle(token.id, destination, movementColor);

        // Initiate camera pan to the destination
        this.panCameraToDestination(destination);

        const movement = {
            token: token,
            gridSpaces: gridSpaces,
            currentIndex: 0,
            isMoving: true,
            isPaused: false,
            destination: destination, // Set the destination property correctly
            color: movementColor, // Store the color for future reference
        };

        this.movements.set(token.id, movement);
        console.log(`Movement object created for token ${token.name}:`, movement);

        if (!this.tickInterval) {
            console.log('Starting tick interval');
            this.tickInterval = setInterval(() => this.tick(), this.tickRate);
        }
    }


    tick() {
        // Check if the game is paused and return early if it is
        if (game.paused) {
            console.log('Game is paused, skipping tick.');
            return;
        }

        // Create a map to track grid spaces that will be occupied in this tick
        const spacesToOccupy = new Map();

        // First pass: Check for conflicts without moving any tokens
        this.movements.forEach((movement, tokenId) => {
            if (!movement.isMoving || movement.isPaused) {
                return;
            }

            const nextIndex = movement.currentIndex + 1;
            if (nextIndex < movement.gridSpaces.length) {
                const nextGridSpace = movement.gridSpaces[nextIndex];
                const spaceKey = JSON.stringify(nextGridSpace);

                if (spacesToOccupy.has(spaceKey)) {
                    // Conflict detected, decide which token waits
                    const conflictingTokenId = spacesToOccupy.get(spaceKey);
                    const chosenTokenId = Math.random() < 0.5 ? tokenId : conflictingTokenId;

                    // The chosen token will wait for one tick
                    if (chosenTokenId === tokenId) {
                        console.log(`Token ${movement.token.name} with ID ${tokenId} will wait for one tick due to conflict.`);
                        movement.isPaused = true; // Pause the chosen token for one tick
                    } else {
                        const otherMovement = this.movements.get(conflictingTokenId);
                        console.log(`Token ${otherMovement.token.name} with ID ${conflictingTokenId} will wait for one tick due to conflict.`);
                        otherMovement.isPaused = true; // Pause the other token for one tick
                    }
                } else {
                    // No conflict, mark the space to be occupied
                    spacesToOccupy.set(spaceKey, tokenId);
                }
            }
        });

        // Second pass: Move tokens that are not paused
        this.movements.forEach((movement, tokenId) => {
            if (!movement.isMoving || movement.isPaused) {
                if (movement.isPaused) {
                    movement.isPaused = false;
                }
                return;
            }

            const currentGridSpace = movement.gridSpaces[movement.currentIndex];
            this.moveToken(movement.token, currentGridSpace);
            movement.currentIndex++;

            if (movement.currentIndex >= movement.gridSpaces.length) {
                this.stopMovement(tokenId);
            } else {
                const remainingGridSpaces = movement.gridSpaces.slice(movement.currentIndex);
                visualManager.updatePathLine(tokenId, remainingGridSpaces);
            }
        });
    }



// Method to resolve conflicts when two tokens are on the same grid space
    resolveOverlapConflict(tokenId) {
        const movement = this.movements.get(tokenId);
        if (!movement) return;

        const currentGridSpace = movement.gridSpaces[movement.currentIndex];
        const tokensAtSameSpace = canvas.tokens.placeables.filter(t => {
            const tokenGridSpace = gridSpaceManager.getGridSpaceFromToken(t);
            return tokenGridSpace.x === currentGridSpace.x && tokenGridSpace.y === currentGridSpace.y;
        });

        if (tokensAtSameSpace.length > 1) {
            // Find an unoccupied adjacent space
            const adjacentSpaces = getAdjacentGridSpaces(currentGridSpace);
            for (const space of adjacentSpaces) {
                if (!gridSpaceManager.isReserved(space, tokenId, Number.MAX_SAFE_INTEGER)) {
                    // Move the token to the unoccupied space
                    this.moveToken(movement.token, space);
                    console.log(`Moved token ${movement.token.name} to resolve overlap at space ${JSON.stringify(space)}`);
                    break;
                }
            }
        }
    }

    stopMovement(tokenId) {
        const movement = this.movements.get(tokenId);
        if (movement && movement.isMoving) {
            movement.isMoving = false;

            // Clear the path line
            visualManager.clearPathLine(tokenId);

            // Check if the token has reached its destination before clearing the destination circle
            if (movement.currentIndex >= movement.gridSpaces.length - 1) {
                visualManager.clearDestinationCircle(tokenId);
            }

            console.log(`Stopping movement for token ${movement.token.name} with ID ${tokenId}`);

            this.movements.delete(tokenId);
            this.resolveOverlapConflict(tokenId);
        }
    }

    // Method to pause movement for a specific token
    pauseMovement(tokenId) {
        const movement = this.movements.get(tokenId);
        if (movement) {
            movement.isPaused = true;
            console.log(`Paused movement for token with ID ${tokenId}`);
        }
    }

    // Method to resume movement for a specific token
    resumeMovement(tokenId) {
        const movement = this.movements.get(tokenId);
        if (movement) {
            movement.isPaused = false;
            console.log(`Resumed movement for token with ID ${tokenId}`);
        }
    }

    cancelAllMovements() {
        this.movements.forEach((_, tokenId) => {
            this.stopMovement(tokenId);
        });
        visualManager.clearAllDestinationCircles(); // Clear all destination circles
    }

    // Moves the token to the specified position
    async moveToken(token, position) {
        const updateData = {
            x: position.x * canvas.grid.size,
            y: position.y * canvas.grid.size
        };

        const tokenDocument = token.document;

        try {
            await tokenDocument.update(updateData);
            console.log(`Token ${token.name} moved to (${position.x}, ${position.y})`);

            const movement = this.movements.get(token.id);
            if (movement) {
                const previousIndex = movement.currentIndex - 1;
                if (previousIndex >= 0) {
                    const previousSpace = movement.gridSpaces[previousIndex];
                    gridSpaceManager.releaseSpace(previousSpace);
                }
                gridSpaceManager.reserveSpace(position, token.id, movement.currentIndex);
            }

            // Removed the panCameraToToken call here to stop following the token
        } catch (err) {
            console.error(`Error moving token ${token.name}:`, err);
        }
    }

    // Method to pan the camera smoothly to a token's position
    panCameraToDestination(destination) {

        // Check if the setting for camera panning is enabled, if disabled return early
        if (!game.settings.get("rtscontrols", "cameraPanning")) {
            return;
        }


        const position = {
            x: destination.x * canvas.grid.size + canvas.grid.size / 2,
            y: destination.y * canvas.grid.size + canvas.grid.size / 2
        };
        const panOptions = {
            x: position.x,
            y: position.y,
            duration: 3000, // Duration of the camera pan in milliseconds
            ease: "easeInOut" // Use an easing function for smooth transition
        };

        // Use Foundry VTT's animatePan method to smoothly pan the camera
        canvas.animatePan(panOptions);
    }
}



// Instantiate the Movement Manager
const movementManager = new MovementManager();

// Event listener for right-click context menu to initiate token movement
document.addEventListener("contextmenu", async (event) => {
    event.preventDefault();

    // Calculate the duration of the right-click
    const clickDuration = Date.now() - rightClickStartTime;

    // If the duration exceeds the threshold, it's considered a pan, not a click
    if (clickDuration >= clickThreshold) {
        console.log("Ignoring pan action for token movement.");
        return; // Exit the function early to avoid initiating token movement
    }

    // Translate the click position to canvas coordinates
    const transform = canvas.app.stage.worldTransform;
    const toX = (event.clientX - transform.tx) / canvas.stage.scale.x;
    const toY = (event.clientY - transform.ty) / canvas.stage.scale.y;

    const toGridX = Math.floor(toX / canvas.grid.size);
    const toGridY = Math.floor(toY / canvas.grid.size);

    const selectedTokens = canvas.tokens.controlled;
    if (selectedTokens.length === 0) return;

    const gridSize = canvas.grid.size;
    const destination = { x: toGridX, y: toGridY };

    // Find alternative destinations for all tokens
    const alternatives = await findAlternativeDestinations(destination, gridSize, selectedTokens.length);

    // Calculate paths from each token's current location to the destination
    for (let i = 0; i < selectedTokens.length; i++) {
        const token = selectedTokens[i];
        const start = gridSpaceManager.getGridSpaceFromToken(token); // Get the token's current grid space

        // Use the clicked destination for the first token, or the best alternative destination for others
        const targetDestination = (i < alternatives.length) ? alternatives[i].position : destination;

        const pathResult = await findPath(start, targetDestination, gridSize);
        if (pathResult && pathResult.path) {
            movementManager.startMovement(token, pathResult.path);
        } else {
            console.warn(`No path found for token ${token.name} with ID ${token.id}`);
        }
    }
});

// Event listeners for Foundry VTT's pause and resume game events
Hooks.on("pauseGame", () => {
    // Pause all movements
    movementManager.movements.forEach((_, tokenId) => {
        movementManager.pauseMovement(tokenId);
    });
    console.log('Game paused, all movements paused.');
});

Hooks.on("resumeGame", () => {
    // Resume all movements
    movementManager.movements.forEach((_, tokenId) => {
        movementManager.resumeMovement(tokenId);
    });
    console.log('Game resumed, all movements resumed.');
});

class GridSpaceCalculator {
    // Method to calculate the line between two points in a grid
    static calculateLine(start, end) {
        const path = [];
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);
        const sx = (start.x < end.x) ? 1 : -1;
        const sy = (start.y < end.y) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            path.push({ x: start.x, y: start.y });

            if (start.x === end.x && start.y === end.y) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                start.x += sx;
            }
            if (e2 < dx) {
                err += dx;
                start.y += sy;
            }
        }
        return path;
    }

    // Method to calculate all grid spaces between waypoints
    static calculateGridSpacesForPath(waypoints) {
        console.log(`Calculating grid spaces for waypoints:`, waypoints);
        if (waypoints.length < 2) {
            console.log("Warning: Path has less than 2 waypoints, might result in no movement.");
        }
        const gridSpaces = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const segment = this.calculateLine({ ...waypoints[i] }, { ...waypoints[i + 1] });
            console.log(`Segment from ${JSON.stringify(waypoints[i])} to ${JSON.stringify(waypoints[i + 1])}:`, segment);
            gridSpaces.push(...segment);
        }

        // Removing duplicates, as lines may intersect on nodes
        const uniqueGridSpaces = Array.from(new Set(gridSpaces.map(JSON.stringify)), JSON.parse);
        console.log(`Calculated unique grid spaces:`, uniqueGridSpaces);

        return uniqueGridSpaces;
    }
}

function getAdjacentGridSpaces(center, includeCenter = false) {
    const adjacent = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx !== 0 || dy !== 0 || includeCenter) {
                adjacent.push({ x: center.x + dx, y: center.y + dy });
            }
        }
    }
    return adjacent;
}

class VisualManager {
    constructor() {
        this.lineGraphicsMap = new Map(); // Maps token ID to its line graphics
        this.circleGraphicsMap = new Map(); // Maps token ID to its circle graphics
    }

    drawPathLine(tokenId, gridSpaces, movementColor) {
        let lineGraphics = this.lineGraphicsMap.get(tokenId);
        if (!lineGraphics) {
            lineGraphics = new PIXI.Graphics();
            this.lineGraphicsMap.set(tokenId, lineGraphics);
            canvas.drawings.addChild(lineGraphics);
        } else {
            lineGraphics.clear();
        }

        const halfGridSize = canvas.grid.size / 2;
        const lineAlpha = 0.5; // Base alpha value for the line
        const fadeLength = 5; // Number of segments to apply the fading effect to

        if (gridSpaces.length > 0) {
            const firstSpace = gridSpaces[0];
            lineGraphics.moveTo(firstSpace.x * canvas.grid.size + halfGridSize, firstSpace.y * canvas.grid.size + halfGridSize);

            gridSpaces.forEach((space, index) => {
                // Calculate the alpha for the current segment
                let segmentAlpha = lineAlpha;
                if (index < fadeLength) {
                    segmentAlpha *= (index + 1) / fadeLength;
                }

                // Set the line style with the calculated alpha
                lineGraphics.lineStyle({ width: 2, color: movementColor, alpha: segmentAlpha, alignment: 0.5 });

                // Draw the line segment
                lineGraphics.lineTo(space.x * canvas.grid.size + halfGridSize, space.y * canvas.grid.size + halfGridSize);
            });
        }
    }

    drawDestinationCircle(tokenId, destination) {
        let circleGraphics = this.circleGraphicsMap.get(tokenId);
        if (!circleGraphics) {
            circleGraphics = new PIXI.Graphics();
            this.circleGraphicsMap.set(tokenId, circleGraphics);
            canvas.drawings.addChild(circleGraphics);
        } else {
            circleGraphics.clear();
        }

        const halfGridSize = canvas.grid.size / 2;

        // Override the colour with the one from the settings by getting from the settings
        let color = game.settings.get("rtscontrols", "destinationCircleColor");


        circleGraphics.beginFill(color, 0.1);
        circleGraphics.drawCircle(destination.x * canvas.grid.size + halfGridSize, destination.y * canvas.grid.size + halfGridSize, canvas.grid.size / 2);
        circleGraphics.endFill();
    }

    clearPathLine(tokenId) {
        const lineGraphics = this.lineGraphicsMap.get(tokenId);
        if (lineGraphics) {
            lineGraphics.clear(); // Clears the graphics content
            canvas.drawings.removeChild(lineGraphics); // Removes the graphics object from the canvas
            this.lineGraphicsMap.delete(tokenId); // Removes the reference from the map
        }
    }

    clearDestinationCircle(tokenId) {
        const circleGraphics = this.circleGraphicsMap.get(tokenId);
        if (circleGraphics) {
            circleGraphics.clear(); // Clears the graphics content
            canvas.drawings.removeChild(circleGraphics); // Removes the graphics object from the canvas
            this.circleGraphicsMap.delete(tokenId); // Removes the reference from the map
        }
    }

    clearAllDestinationCircles() {
        this.circleGraphicsMap.forEach((circleGraphics) => {
            circleGraphics.clear(); // Clears the graphics content
            canvas.drawings.removeChild(circleGraphics); // Removes the graphics object from the canvas
        });
        this.circleGraphicsMap.clear(); // Clears the entire map
    }


    updatePathLine(tokenId, remainingGridSpaces) {
        // Call this method with the remaining path when a token moves
        const tokenVisuals = this.lineGraphicsMap.get(tokenId);
        if (tokenVisuals) {
            const color = tokenVisuals.color; // Ensure to store the color somewhere or pass it as a parameter
            this.drawPathLine(tokenId, remainingGridSpaces, color);
            // The destination circle should remain intact until the token reaches the destination
        }
    }
}

const visualManager = new VisualManager();

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        console.log('Escape key pressed, canceling all movements and clearing destination circles.');
        movementManager.cancelAllMovements();
    }
});

Hooks.on("pauseGame", (isPaused) => {
    if (isPaused) {
        // Game is paused
        movementManager.movements.forEach((_, tokenId) => {
            movementManager.pauseMovement(tokenId);
        });
        console.log('Game paused, all movements paused.');
        // Clear the tick interval to stop movement updates
        if (movementManager.tickInterval) {
            clearInterval(movementManager.tickInterval);
            movementManager.tickInterval = null;
            console.log('Tick interval cleared.');
        }
    } else {
        // Game is unpaused (resumed)
        movementManager.movements.forEach((_, tokenId) => {
            movementManager.resumeMovement(tokenId);
        });
        console.log('Game resumed, all movements resumed.');
        // Restart the tick interval if there are movements to process
        if (!movementManager.tickInterval && movementManager.movements.size > 0) {
            console.log('Starting tick interval');
            movementManager.tickInterval = setInterval(() => movementManager.tick(), movementManager.tickRate);
        }
    }
});


async function findAlternativeDestinations(destination, gridSize, numTokens) {
    const alternatives = [];
    // Calculate a range based on the number of tokens, with a minimum value to ensure at least some alternatives are checked
    // The range is now directly proportional to the number of tokens
    const range = Math.min(numTokens, 3); // Limit the range to a maximum of 3 for example

    // Loop through a grid around the destination within the calculated range
    for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
            const alternativeEnd = { x: destination.x + dx, y: destination.y + dy };
            // Skip out-of-bounds locations
            if (!isValidGridCoordinate(alternativeEnd)) continue;
            // Calculate the path from the alternative destination to the primary destination
            try {
                const pathResult = await routinglib.calculatePath(alternativeEnd, destination, { interpolate: false });
                if (pathResult && pathResult.path) {
                    alternatives.push({ position: alternativeEnd, cost: pathResult.cost });
                }
            } catch (error) {
                console.error(`Error calculating path to alternative destination: (${alternativeEnd.x}, ${alternativeEnd.y})`, error);
            }
        }
    }

    // Output console log telling how many grid spaces were checked
    console.log(`Checked ${alternatives.length} grid spaces around destination (${destination.x}, ${destination.y})`);

    // Sort the alternatives by cost, ascending
    alternatives.sort((a, b) => a.cost - b.cost);

    // Return only the best alternatives up to the number of selected tokens
    return alternatives.slice(0, numTokens);
}

// Helper function to check if a grid coordinate is valid
function isValidGridCoordinate(coordinate) {
    const { x, y } = coordinate;
    return x >= 0 && x < canvas.grid.width && y >= 0 && y < canvas.grid.height;
}
