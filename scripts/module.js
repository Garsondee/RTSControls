/**
 * RTS Controls - Right Click to Move
 *
 * The goal of this script is to the allow users to right-click to move a token or multiple tokens on either a gridded or gridless scene within
 * Foundry VTT.
 *
 */

/**
 *
 * The `routinglib` utilizes a specific coordinate system for its operations, where coordinates are represented as objects containing `x` and `y` attributes. These attributes vary based on the scene type:
 * - For gridded scenes (square and hex), `x` and `y` represent grid cells.
 * - For gridless scenes, `x` and `y` are in pixels.
 *
 * `routinglib.calculatePath(from, to, options)` initiates an asynchronous pathfinding calculation from a start point (`from`) to an end point (`to`) with optional settings (`options`). It returns a promise that, upon resolution, provides details about the path:
 * - `path`: An array of coordinates denoting the route, including start and end points.
 * - `cost`: The length of the path, factoring in difficult terrain if applicable.
 *
 * Options:
 * - `token`: Specify a token to consider its size, elevation, etc., during routing.
 * - `ignoreTerrain` (default: false): Ignore terrain if set to true.
 * - `elevation`: Set routing elevation, overriding the token's elevation if provided.
 * - `maxDistance`: Limits the search to paths no longer than this value.
 *
 * Gridded pathfinder exclusive options:
 * - `interpolate` (default: true): Minimizes waypoints unless set to false, which generates a waypoint for every grid cell traversed.
 *
 * To cancel an ongoing pathfinding operation for performance reasons, use `routinglib.cancelPathfinding(promise)`, passing the promise returned by `calculatePath`. The cancelled promise becomes invalid and will not resolve.
 */

// Global Functions:
function isCurrentSceneGridless() {
    return canvas.scene.grid.type === 0;
}

class PathfindingModule {
    constructor() {}

    async calculatePathInternal(from, to, options = {}) {
        const isGridless = isCurrentSceneGridless();
        console.log(`calculatePathInternal: Direct gridType check: ${canvas.scene.grid.type}`);
        console.log(`calculatePathInternal: calculatePathInternal called for a ${isGridless ? "gridless" : "gridded"} scene.`);
        console.log(`calculatePathInternal: From (treated as ${isGridless ? "pixels" : "grid coordinates"}):`, from);
        console.log(`calculatePathInternal: To (treated as ${isGridless ? "pixels" : "grid coordinates"}):`, to);
        console.log("From:", from);
        console.log("calculatePathInternal: To:", to);
        console.log("calculatePathInternal: Options:", options);

        try {
            console.log("calculatePathInternal: Starting pathfinding operation...");
            const pathResult = await routinglib.calculatePath(from, to, options);
            console.log("calculatePathInternal: Raw pathfinding result:", pathResult);

            if (pathResult) {
                console.log("calculatePathInternal: Path details:");
                console.log("calculatePathInternal: Path length:", pathResult.path.length);
                console.log("calculatePathInternal: Path cost:", pathResult.cost);
                console.log("calculatePathInternal: Path waypoints:", pathResult.path);
            } else {
                console.warn("calculatePathInternal: Pathfinding returned null or undefined result.");
            }

            return pathResult;
        } catch (error) {
            console.error("calculatePathInternal: Error during path calculation:", error);

            if (error instanceof Error) {
                console.error("calculatePathInternal: Error name:", error.name);
                console.error("calculatePathInternal: Error message:", error.message);
                if (error.stack) {
                    console.error("calculatePathInternal: Error stack trace:", error.stack);
                }
            }
            return null;
        }
    }

    async findPathGridded(start, end, options = {}) {
        console.log(`findPathGridded: Gridded Pathfinding: Pixel coordinates: x=${start.x}, y=${start.y}`);
        console.log(`findPathGridded: Gridded Pathfinding: Grid coordinates: x=${start.gridX}, y=${start.gridY}`);

        const pathfindingOptions = {
            ...options, interpolate: false
        };

        const pathResult = await this.calculatePathInternal(start, end, pathfindingOptions);
        return pathResult;
    }

    async findPathGridless(start, end, options = {}) {
        console.log("findPathGridless: Starting gridless pathfinding...");
        console.log(`findPathGridless: Gridless Pathfinding: Start coordinates: x=${start.x}, y=${start.y}`);
        console.log(`findPathGridless: Gridless Pathfinding: End coordinates: x=${end.x}, y=${end.y}`);
        console.log("findPathGridless: Initial pathfinding options:", options);

        const pathfindingOptions = {
            ...options, ignoreTerrain: false
        };

        console.log("findPathGridless: Adjusted pathfinding options to consider terrain and interpolation:", pathfindingOptions);

        try {
            console.log("findPathGridless: Invoking routinglib.calculatePath for gridless pathfinding...");

            const pathResult = await routinglib.calculatePath(start, end, pathfindingOptions);

            if (!pathResult) {
                console.error("findPathGridless: No path found or pathfinding cancelled.");
                return null;
            }

            // Interpolate the path for smoother movement in gridless scenes
            if (pathResult && pathResult.path) {
                pathResult.path = this.interpolatePathForGridless(pathResult.path);
            }

            console.log("findPathGridless: Path found:", pathResult.path);
            console.log("findPathGridless: Path cost:", pathResult.cost);

            return pathResult;
        } catch (error) {
            console.error("findPathGridless: Error during gridless path calculation:", error);
            return null;
        }
    }

    isValidGridCoordinate(coordinate) {
        console.log("isValidGridCoordinate: Validating grid coordinate:", coordinate);
        if (!canvas || !canvas.grid) {
            console.warn("isValidGridCoordinate: Canvas or grid is not initialized.");
            return false;
        }
        const {x, y} = coordinate;
        return x >= 0 && x < canvas.grid.width && y >= 0 && y < canvas.grid.height;
    }

    async findAlternativeDestinations(destination, gridSize, numTokens) {
        console.log("findAlternativeDestinations: Starting alternative destination search...");
        console.log(`findAlternativeDestinations: Destination: x=${destination.x}, y=${destination.y}, gridSize=${gridSize}, numTokens=${numTokens}`);
        const alternatives = [];
        let firstResultSkipped = false; // Flag to indicate if the first result has been skipped

        const range = Math.min(numTokens, 3); // Limit the range for example
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const alternativeEnd = {
                    x: destination.x + dx, y: destination.y + dy
                };
                if (!this.isValidGridCoordinate(alternativeEnd)) continue;
                try {
                    const pathResult = await this.findPathGridded(destination, alternativeEnd, {interpolate: false});
                    if (pathResult && pathResult.path) {
                        if (!firstResultSkipped) {
                            // Skip the first result by setting the flag to true and continue to the next iteration
                            firstResultSkipped = true;
                            continue;
                        }
                        alternatives.push({
                            position: alternativeEnd, cost: pathResult.cost
                        });
                    }
                } catch (error) {
                    console.error(`findAlternativeDestinations: Error calculating path to alternative destination: (${alternativeEnd.x}, ${alternativeEnd.y})`, error);
                }
            }
        }

        alternatives.sort((a, b) => a.cost - b.cost);
        return alternatives.slice(1, numTokens);
    }

    async findAlternativeDestinationsGridless(centralDestination, tokens, options = {}) {
        console.log("findAlternativeDestinationsGridless;: Starting alternative destination search...");
        console.log("findAlternativeDestinationsGridless: Central destination:", centralDestination, "tokens:", tokens, "options:", options);
        const {searchRadius = 25, baseAngleIncrement = 360 / tokens.length} = options;
        const alternatives = [];
        const extraDestinationsFactor = 2.5; // Factor to calculate extra destinations
        const totalDestinations = Math.ceil(tokens.length * extraDestinationsFactor); // Total destinations including extras
        const angleIncrement = 360 / totalDestinations; // Adjusted angle increment to accommodate extra destinations

        // Ensure tokens are passed as an array to calculateGeometricCenter
        const geometricCenter = this.calculateGeometricCenter(Array.isArray(tokens) ? tokens : [tokens]);

        // Calculate alternative destinations including extra destinations
        for (let i = 0; i < totalDestinations; i++) {
            const angle = (angleIncrement * i) * (Math.PI / 180); // Convert degrees to radians
            const tokenSizeOffset = this.calculateTokenSizeOffset(tokens[0]); // Assuming all tokens are of similar size
            const x = centralDestination.x + (searchRadius + tokenSizeOffset) * Math.cos(angle);
            const y = centralDestination.y + (searchRadius + tokenSizeOffset) * Math.sin(angle);

            const alternativeDestination = {x, y};
            alternatives.push({position: alternativeDestination, cost: Number.MAX_SAFE_INTEGER}); // Initialize with max cost
        }

        // Perform pathfinding for each alternative from the geometric center
        for (const alternative of alternatives) {
            try {
                const pathResult = await this.findPathGridless(geometricCenter, alternative.position, {ignoreTerrain: false});
                if (pathResult && pathResult.path) {
                    alternative.cost = pathResult.cost;
                    alternative.path = pathResult.path;
                } else {
                    alternative.cost = Number.MAX_SAFE_INTEGER; // Assign a high cost if no path is found
                }
            } catch (error) {
                console.error("Error during pathfinding to alternative destination:", error);
                alternative.cost = Number.MAX_SAFE_INTEGER;
            }
        }

        // Sort alternatives by cost and return the best ones based on the original number of tokens
        alternatives.sort((a, b) => a.cost - b.cost);
        return alternatives.slice(0, tokens.length);
    }

    calculateTokenSizeOffset(token) {
        // Calculate an offset based on the token size to prevent overlapping
        // This is a simple approach and can be adjusted based on your needs
        const averageSize = (token.w + token.h) / 1.8; // Average of width and height
        return averageSize / 1.8; // Return half of the average size as the offset
    }

    calculateGeometricCenter(tokens) {
        if (!Array.isArray(tokens) || tokens.length === 0) {
            console.error("calculateGeometricCenter: Invalid or empty tokens array passed.");
            return {x: 0, y: 0};
        }

        const sum = tokens.reduce((acc, token) => {
            acc.x += token.x + token.w / 2; // Assuming token.x and token.w are the top-left corner and width of the token
            acc.y += token.y + token.h / 2; // Assuming token.y and token.h are the top-left corner and height of the token
            return acc;
        }, {x: 0, y: 0});

        return {
            x: sum.x / tokens.length,
            y: sum.y / tokens.length
        };
    }

    interpolatePathForGridless(path) {
        const interpolatedPath = [];
        const gridSize = game.settings.get("rtscontrols", "gridlessGridSize");

        for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
            interpolatedPath.push(start);

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.max(Math.floor(distance / gridSize), 1);

            for (let step = 1; step < steps; step++) {
                const interpolatedPoint = {
                    x: start.x + (dx * step / steps),
                    y: start.y + (dy * step / steps)
                };
                interpolatedPath.push(interpolatedPoint);
            }
        }

        // Ensure the final point is always added
        interpolatedPath.push(path[path.length - 1]);

        return interpolatedPath;
    }
}

class MovementManager {
    constructor(gridSpaceManager, visualManager, cameraManager) {
        this.movements = new Map(); // Maps token ID to movement data
        this.tickInterval = null; // Interval for processing movements
        this.gridSpaceManager = gridSpaceManager;
        this.visualManager = visualManager;
        this.cameraManager = cameraManager;
        this.movementSpeed = game.settings.get("rtscontrols", "movementSpeed"); // Get the movement speed setting
    }

    startMovement(token, path) {
        const movement = {
            token: token, path: path, currentIndex: 0, isMoving: true, isPaused: false
        };

        this.movements.set(token.id, movement);

        // Start following the token with the camera
        if (game.settings.get("rtscontrols", "cameraPanning")) {
            const selectedTokens = canvas.tokens.controlled;
            if (selectedTokens.length > 0 && token.id === selectedTokens[0].id) {
                this.cameraManager.panCameraToToken(token);
            }
        }

        if (!this.tickInterval) {
            this.tickInterval = setInterval(() => this.processMovementTicks(), this.movementSpeed); // Use the movement speed for the interval
        }
    }

    async processMovementTicks() {
        for (let [tokenId, movement] of this.movements) {
            if (!movement.isMoving || movement.isPaused) continue;

            if (movement.currentIndex < movement.path.length - 1) {
                const nextIndex = movement.currentIndex + 1;
                const nextPosition = movement.path[nextIndex];

                await new Promise((resolve) => {
                    this.moveToken(movement.token, nextPosition, resolve);
                });

                movement.currentIndex = nextIndex;

                // Calculate progress and update path visibility
                const progress = movement.currentIndex / (movement.path.length - 1);
                this.visualManager.updatePathVisibility(tokenId, progress);

                if (nextIndex === movement.path.length - 1) {
                    this.stopMovement(tokenId);
                }
            }
        }
    }

    moveToken(token, position, callback) {
        console.log(`moveToken: Token: ${token.id}, Position: x=${position.x}, y=${position.y}`);
        const isGridless = isCurrentSceneGridless();

        let pixelPosition;
        if (isGridless) {
            // Calculate the center position for gridless scenes
            pixelPosition = {
                x: Math.round(position.x - token.w / 2), y: Math.round(position.y - token.h / 2)
            };
        } else {
            pixelPosition = this.calculatePixelPosition(position, token);
        }

        token.document.update(pixelPosition).then(() => {
            console.log(`moveToken: Token final position: x=${token.x}, y=${token.y}`);
            if (callback) callback();
        });
    }

    calculatePixelPosition(position, token) {
        const isGridless = isCurrentSceneGridless();
        let pixelPosition;
        if (isGridless) {
            pixelPosition = this.gridSpaceManager.virtualGridToPixel(position);
        } else {
            const centerX = position.x * canvas.grid.size;
            const centerY = position.y * canvas.grid.size;
            pixelPosition = {
                x: centerX, y: centerY,
            };
        }
        console.log("calculatePixelPosition: Calculated pixel position", {position, pixelPosition, isGridless});
        return pixelPosition;
    }

    stopMovement(tokenId) {
        const movement = this.movements.get(tokenId);
        if (movement) {
            movement.isMoving = false;
            console.log(`stopMovement: Stopping movement for token ${movement.token.name} with ID ${tokenId}`);
            this.movements.delete(tokenId);
            this.visualManager.clearPathLine(tokenId);

            if (this.movements.size === 0) {
                clearInterval(this.tickInterval);
                this.tickInterval = null;
            }
        }

        // Stop following the token with the camera
        this.cameraManager.stopFollowingToken();
    }

    isTokenMoving(tokenId) {
        return this.movements.has(tokenId) && this.movements.get(tokenId).isMoving;
    }

    updateMovement(token, newPath) {
        // Check if the token is already moving
        if (this.movements.has(token.id)) {
            // Clear the existing path for the token
            this.visualManager.clearPathLine(token.id);
            // Update the movement with the new path
            const movement = this.movements.get(token.id);
            movement.path = newPath;
            movement.currentIndex = 0; // Reset the index to start from the beginning of the new path
            // Optionally, redraw the path if needed
            this.visualManager.drawPathLine(token.id, newPath, "#00FF00"); // Example color: Green
        } else {
            // If the token is not already moving, start the movement normally
            this.startMovement(token, newPath);
        }
    }

    pauseAllMovements() {
        this.movements.forEach((movement, tokenId) => {
            movement.isPaused = true;
        });
        console.log('pauseAllMovements: All movements paused.');
    }

    resumeAllMovements() {
        this.movements.forEach((movement, tokenId) => {
            movement.isPaused = false;
        });
        console.log('resumeAllMovements: All movements resumed.');
    }

    cancelAllMovements() {
        this.movements.forEach((_, tokenId) => this.stopMovement(tokenId));
        console.log('cancelAllMovements: All movements cancelled.');
    }
}

class VisualManager {
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        this.pathLineDrawings = new Map();
        this.drawingOperationsQueue = []; // Queue for drawing operations
        this.processingQueue = false; // Flag to indicate if the queue is currently being processed
    }

    // Method to add a drawing operation to the queue
    enqueueDrawingOperation(operation) {
        this.drawingOperationsQueue.push(operation);
        this.processDrawingOperationsQueue();
    }

    // Method to process the drawing operations queue
    async processDrawingOperationsQueue() {
        if (this.processingQueue || this.drawingOperationsQueue.length === 0) {
            return;
        }
        this.processingQueue = true;
        while (this.drawingOperationsQueue.length > 0) {
            const operation = this.drawingOperationsQueue.shift();
            await operation();
        }
        this.processingQueue = false;
    }

    // Determine if the current scene is gridless
    isCurrentSceneGridless() {
        return canvas.scene.grid.type === 0;
    }

    normalizePoint(point) {
        if (this.isCurrentSceneGridless()) {
            // For gridless scenes, use the pixel coordinates directly without scaling
            console.log("Gridless Scene Point Normalisation: (X and Y)", point.x, point.y);
            return {x: point.x, y: point.y};
        } else {
            console.log("Gridded Scene Point Normalisation: (X and Y)", point.x, point.y);
            return {
                x: point.x * canvas.grid.size + canvas.grid.size / 2,
                y: point.y * canvas.grid.size + canvas.grid.size / 2
            };
        }
    }

    normalizePath(path) {
        return path.map(p => this.normalizePoint(p));
    }

    isValidPoint(point) {
        return point && typeof point.x === 'number' && typeof point.y === 'number';
    }

    validatePath(path) {
        if (!Array.isArray(path) || path.length === 0) {
            console.error("Invalid path: Path is not an array or is empty.");
            return false;
        }
        return path.every(p => this.isValidPoint(p));
    }

    async drawPathLine(tokenId, path, color = game.settings.get("rtscontrols", "destinationCircleColor")) {
        // Check if line drawing is enabled
        if (!game.settings.get("rtscontrols", "drawPathLine")) {
            console.log("Line drawing is disabled.");
            return;
        }

        this.enqueueDrawingOperation(async () => {
            if (!this.validatePath(path)) {
                console.error("drawPathLine: Invalid path data.");
                return;
            }

            const normalizedPath = this.normalizePath(path);
            const strokeColor = game.settings.get("rtscontrols", "destinationCircleColor");
            const points = normalizedPath.flatMap(p => [p.x, p.y]);

            const drawingData = {
                type: "p",
                author: game.user.id,
                x: 0, y: 0,
                strokeWidth: 3,
                strokeColor: strokeColor,
                strokeAlpha: 1.0,
                fillColor: "#00000000",
                fillAlpha: 0.0,
                points: points,
                texture: "",
                hidden: false,
                locked: true
            };

            try {
                const createdDrawing = await DrawingDocument.create(drawingData, {parent: canvas.scene});
                this.pathLineDrawings.set(tokenId, createdDrawing.id);
                // Draw a circle at the endpoint
                await this.drawCircleAtEndpoint(tokenId, normalizedPath[normalizedPath.length - 1], color);
            } catch (error) {
                console.error("Error creating path line drawing:", error);
            }
        });
    }

    async drawCircleAtEndpoint(tokenId, endpoint) {
        // Directly fetch the color setting within the method
        const color = game.settings.get("rtscontrols", "destinationCircleColor");

        this.enqueueDrawingOperation(async () => {
            const circleData = {
                type: "e", // Ellipse type
                author: game.user.id,
                x: endpoint.x - ((canvas.grid.size / 2) / 2),
                y: endpoint.y - ((canvas.grid.size / 2) / 2),
                width: 50, // Adjust size as needed
                height: 50, // Adjust size as needed
                strokeColor: color,
                strokeAlpha: 1.0,
                strokeWidth: 25,
                fillColor: color,
                fillAlpha: 1.0,
                hidden: false,
                locked: true
            };

            try {
                const createdCircle = await DrawingDocument.create(circleData, {parent: canvas.scene});
                // Optionally, store the circle's ID if you need to reference it later
                this.pathLineDrawings.set(tokenId + "_circle", createdCircle.id);
            } catch (error) {
                console.error("Error creating endpoint circle:", error);
            }
        });
    }

    updatePathVisibility(tokenId, progress) {
        this.enqueueDrawingOperation(async () => {
            const drawingId = this.pathLineDrawings.get(tokenId);
            if (!drawingId) return;

            const drawing = canvas.drawings.get(drawingId);
            if (!drawing) return;

            // Calculate new alpha based on progress
            const newAlpha = Math.max(1 - progress, 0);

            // Update the drawing's stroke alpha
            await drawing.document.update({strokeAlpha: newAlpha}).catch(console.error);
        });
    }


    // Updated method to clear path line using the queue
    async clearPathLine(tokenId) {
        this.enqueueDrawingOperation(async () => {
            const lineDrawingId = this.pathLineDrawings.get(tokenId);
            if (lineDrawingId) {
                const drawingExists = await canvas.scene.getEmbeddedDocument('Drawing', lineDrawingId);
                if (drawingExists) {
                    await canvas.scene.deleteEmbeddedDocuments('Drawing', [lineDrawingId]);
                    this.pathLineDrawings.delete(tokenId);
                }
            }

            const circleDrawingId = this.pathLineDrawings.get(tokenId + "_circle");
            if (circleDrawingId) {
                const drawingExists = await canvas.scene.getEmbeddedDocument('Drawing', circleDrawingId);
                if (drawingExists) {
                    await canvas.scene.deleteEmbeddedDocuments('Drawing', [circleDrawingId]);
                    this.pathLineDrawings.delete(tokenId + "_circle");
                }
            }
        });
    }

    async clearAllVisuals() {
        for (let drawingId of this.pathLineDrawings.values()) {
            await DrawingDocument.deleteDocuments([drawingId]);
        }
        this.pathLineDrawings.clear();

        console.log("clearAllVisuals: Cleared all path lines and destination circles.");
    }
}

class SettingsManager {
    constructor() {
        this.namespace = "rtscontrols";
    }

    getSetting(key) {
        return game.settings.get(this.namespace, key);
    }

    setSetting(key, value) {
        return game.settings.set(this.namespace, key, value);
    }

    registerSettings() {
        game.settings.register("rtscontrols", "disableModule", {
            name: "Enable Module",
            hint: "Enable the entire module. This allows each user to turn the module off if they prefer the original movement controls.",
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
        })

        game.settings.register("rtscontrols", "drawPathLine", {
            name: "Enable Line Drawing",
            hint: "Enable line drawing when the token moves.",
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
        })

        game.settings.register("rtscontrols", "cameraPanning", {
            name: "Camera Panning",
            hint: "Enable camera panning when the token moves.",
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
        })

        game.settings.register("rtscontrols", "cancelAllMovement", {
            name: "Pause Move Cancelling",
            hint: "When the game pauses, cancel all movement",
            scope: "world", // Changed to world scope
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register("rtscontrols", "allowShiftRightClick", {
            name: "Shift Right Click to Move",
            hint: "Require hold shift + right-click to move.",
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
        })

        game.settings.register("rtscontrols", "allowRightClickCombat", {
            name: "Combat Right Click to Move",
            hint: "Allow right click to move while in combat mode.",
            scope: "world", // Changed to world scope
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register("rtscontrols", "destinationCircleColor", {
            name: "Destination Circle Colour",
            hint: "Set the colour of the destination circle by selecting a color name.",
            scope: "client",
            config: true,
            type: String,
            choices: {
                "#ff0000": "Red",
                "#00ff00": "Green",
                "#0000ff": "Blue",
                "#ffff00": "Yellow",
                "#ff00ff": "Magenta",
                "#00ffff": "Cyan",
                "#ffffff": "White",
                "#000000": "Black",
                "#ff8000": "Orange",
                "#800080": "Purple",
                "#808080": "Grey",
                "#008000": "Dark Green"
            },
            default: "#ff0000", // Default to Red
        });

        game.settings.register("rtscontrols", "maxPathfindDistance", {
            name: "Maximum Pathfinding Distance",
            hint: "Set the maximum distance in grid spaces for pathfinding. A lower value may prevent accidental misclicks from revealing parts of the map. A good middle value is 90.",
            scope: "client",
            config: true,
            type: Number,
            default: 90,
        })

        game.settings.register("rtscontrols", "gridlessGridSize", {
            name: "Gridless Grid Size",
            hint: "On a gridless scene this setting determines how far a token moves in a single step. If you set this very low it will be like an RTS game with incremental movement. If you have a gridless scene but want the tokens to move like they are on a virtual grid increase this value. Experiment with this setting and the token movement speed to get the best balance.",
            scope: "client",
            config: true,
            type: Number,
            default: 50,
        })

        game.settings.register("rtscontrols", "movementSpeed", {
            name: "Token Movement Speed",
            hint: "Set the speed at which tokens move. Changing this setting requires a reload to take effect.",
            scope: "world", // Changed to world scope
            config: true,
            type: String,
            choices: {
                "300": "Normal",
                "400": "Slow",
                "500": "Very Slow",
                "600": "Extremely Slow",
                "700": "Glacial",
                "800": "Continental Drift",
                "900": "Cautious Adventurers",
                "1000": "Traps Around Every Corner",
            },
            default: "400", // Default to Normal speed
            onChange:() => {
                ui.notifications.info("Movement speed setting changed. Please reload your application for the change to take effect.", {permanent: true});
                window.location.reload();
            }
        });
    }
}

class EventManager {
    constructor(pathfindingModule, movementManager, visualManager, settingsManager) {
        this.pathfindingModule = pathfindingModule;
        this.movementManager = movementManager;
        this.visualManager = visualManager;
        this.settingsManager = settingsManager;
        this.cameraManager = movementManager.cameraManager;

        this.rightClickStartTime = 0;
        this.clickThreshold = 150; // milliseconds

        this.initializeEventListeners();
        this.initializeHooks();
    }

    initializeHooks() {
        Hooks.on("pauseGame", this.handleGamePause.bind(this));
        Hooks.on("resumeGame", this.handleGameResume.bind(this));
    }

    handleGamePause(isPaused) {
        if (isPaused) {
            const cancelAllMovementOnPause = this.settingsManager.getSetting("cancelAllMovement");
            console.log(`handleGamePause: Cancel all movement on pause setting: ${cancelAllMovementOnPause}`);
            if (cancelAllMovementOnPause) {
                console.log('handleGamePause: Cancelling all movements due to game pause.');
                this.movementManager.cancelAllMovements();
            } else {
                console.log('handleGamePause: Pausing all movements.');
                this.movementManager.pauseAllMovements();
            }
        } else {
            console.log('handleGamePause: Game resumed, checking if movements need to be resumed.');
            this.movementManager.resumeAllMovements();
        }
    }

    handleGameResume() {
        console.log('Game resumed, resuming all movements.');
        this.movementManager.resumeAllMovements();
    }

    initializeEventListeners() {
        canvas.app.view.addEventListener("contextmenu", this.handleRightClick.bind(this));
        document.addEventListener("mousedown", this.handleMouseDown.bind(this));
        document.addEventListener("mouseup", this.handleMouseUp.bind(this));
        document.addEventListener("keydown", this.handleKeyDown.bind(this));
    }

    handleMouseDown(event) {
        if (event.button === 2) { // Right-click
            this.rightClickStartTime = Date.now();
        }
    }

    handleMouseUp(event) {

        if (event.button === 2) { // Right-click
            const clickDuration = Date.now() - this.rightClickStartTime;
            if (clickDuration >= this.clickThreshold) {
                console.log("Detected a pan");
                this.cameraManager.cancelCameraPan();
            }
        }
    }

    handleKeyDown(event) {
        if (event.key === "Escape") {
            console.log('Escape key pressed, canceling all movements and clearing destination circles.');
            this.movementManager.cancelAllMovements();
            this.cameraManager.cancelCameraPan();
            this.visualManager.clearAllVisuals(); // Clear all destination circles
        }
    }

    async handleRightClick(event) {
        event.preventDefault();

        if (!this.settingsManager.getSetting("disableModule")) {
            console.log("Token movement is disabled.");
            return;
        }

        const allowShiftRightClick = this.settingsManager.getSetting("allowShiftRightClick");
        if (allowShiftRightClick && !event.shiftKey) {
            console.log("Shift-right-click is required but Shift key is not pressed.");
            return;
        }

        const transform = canvas.app.stage.worldTransform;
        const mouseX = (event.clientX - transform.tx) / canvas.stage.scale.x;
        const mouseY = (event.clientY - transform.ty) / canvas.stage.scale.y;

        const isGridless = isCurrentSceneGridless();

        const selectedTokens = canvas.tokens.controlled;
        if (selectedTokens.length === 0) return;

        // Check for a clicked token to ignore move action
        const clickedToken = canvas.tokens.placeables.find(t => {
            const tokenBounds = t.getBounds();
            return event.clientX >= tokenBounds.x && event.clientX <= tokenBounds.x + tokenBounds.width && event.clientY >= tokenBounds.y && event.clientY <= tokenBounds.y + tokenBounds.height;
        });

        if (clickedToken) {
            console.log("Right-click on a token detected. Ignoring move action.");
            return;
        }

        if (game.combat && game.combat.active && !this.settingsManager.getSetting("allowRightClickCombat")) {
            console.log("Game is in combat mode, right-click to move is disabled.");
            ui.notifications.warn("Game is in combat mode, right-click to move is disabled by default.");
            return;
        }

        // Calculate the central destination for the formation
        let centralDestination = {x: mouseX, y: mouseY};
        if (!isGridless) {
            centralDestination = {
                x: Math.floor(mouseX / canvas.grid.size), y: Math.floor(mouseY / canvas.grid.size)
            };
        }

        // If multiple tokens are selected, find alternative destinations
        if (selectedTokens.length > 1) {
            let alternatives;
            if (isGridless) {
                // Adjust the call to findAlternativeDestinationsGridless to account for one less alternative needed
                alternatives = await this.pathfindingModule.findAlternativeDestinationsGridless(centralDestination, selectedTokens.slice(1), {searchRadius: 50});
            } else {
                const gridSize = game.settings.get("rtscontrols", "gridlessGridSize");
                alternatives = await this.pathfindingModule.findAlternativeDestinations(centralDestination, gridSize, selectedTokens.length);
            }

            // Move the first token to the centralDestination directly
            await this.initiateTokenMovement(selectedTokens[0], centralDestination);

            // Move the rest of the tokens to their respective alternative destinations
            for (let i = 1; i < selectedTokens.length; i++) {
                const token = selectedTokens[i];
                // Use the (i-1)th alternative destination since the first token doesn't need one
                const alternativeDestination = alternatives[i - 1] ? alternatives[i - 1].position : centralDestination; // Use alternative if available
                console.log(`Moving token to alternative destination at (${alternativeDestination.x}, ${alternativeDestination.y})`);
                await this.initiateTokenMovement(token, alternativeDestination);
            }
        } else if (selectedTokens.length === 1) {
            // If only one token is selected, move it to the centralDestination
            await this.initiateTokenMovement(selectedTokens[0], centralDestination);
        }
    }

    async initiateTokenMovement(token, destination) {
        let start;
        const isGridless = isCurrentSceneGridless();

        if (isGridless) {
            // Calculate the start position from the token's center in gridless scenes
            start = {x: token.x + token.w / 2, y: token.y + token.h / 2};
        } else {
            // For gridded scenes, calculate the start position based on grid coordinates
            start = {x: Math.floor(token.x / canvas.grid.size), y: Math.floor(token.y / canvas.grid.size)};
        }

        console.log(`initiateTokenMovement: Scene Type: ${isGridless ? "Gridless" : "Gridded"}`);
        console.log(`initiateTokenMovement: Start Position: x=${start.x}, y=${start.y}`);
        console.log(`initiateTokenMovement: Destination: x=${destination.x}, y=${destination.y}`);

        const options = {
            ignoreTerrain: false,
        };

        let pathResult;
        if (isGridless) {
            pathResult = await this.pathfindingModule.findPathGridless(start, destination, options);
        } else {
            pathResult = await this.pathfindingModule.findPathGridded(start, destination, options);
        }

        if (pathResult && pathResult.path) {
            // Check if the token is already moving and update its path if so
            if (this.movementManager.isTokenMoving(token.id)) {
                // Update the movement with the new path
                this.movementManager.updateMovement(token, pathResult.path);
            } else {
                // If the token is not already moving, start the movement normally
                this.movementManager.startMovement(token, pathResult.path);
                // Draw path line and destination circle
                await this.visualManager.drawPathLine(token.id, pathResult.path, "#00FF00"); // Example color: Green
            }
        } else {
            console.warn(`initiateTokenMovement: No path found for token ${token.name} with ID ${token.id}`);
        }
    }
}

class CameraManager {
    constructor(movementManager) {
        this.movementManager = movementManager;
        this.allowCameraPanning = true;
        this.followInterval = null; // Interval for following the token
    }

    // Modified method to start following a moving token
    startFollowingToken(token) {
        const isGridless = isCurrentSceneGridless();

        if (isGridless) {
            return;
        }


        if (this.followInterval) {
            clearInterval(this.followInterval);
        }

        this.followInterval = setInterval(() => {
            if (!this.allowCameraPanning || !token || !this.movementManager.isTokenMoving(token.id)) {
                this.stopFollowingToken();
                return;
            }

            // Access the token's path and current index from the MovementManager
            const movement = this.movementManager.movements.get(token.id);
            if (!movement || movement.currentIndex >= movement.path.length - 1) {
                // If the movement is not found or the token is at the end of its path, stop following
                this.stopFollowingToken();
                return;
            }

            let nextIndex;
            let nextPosition;

            if (isGridless) {
                // In gridless scenes, follow the token more closely
                nextIndex = movement.currentIndex + 1; // Follow the next immediate position
            } else {
                // In gridded scenes, anticipate the token's future position
                const lookaheadSteps = 6; // Adjust this value as needed
                nextIndex = movement.currentIndex + lookaheadSteps;
                if (nextIndex >= movement.path.length) {
                    // Ensure we don't exceed the path length
                    nextIndex = movement.path.length - 1;
                }
            }

            nextPosition = movement.path[nextIndex];

            // Convert the next position to canvas coordinates if necessary
            const anticipatedPosition = this.movementManager.calculatePixelPosition(nextPosition, token);

            canvas.animatePan({
                x: anticipatedPosition.x,
                y: anticipatedPosition.y,
                duration: isGridless ? 500 : 1000, // Faster transition in gridless scenes
            });
        }, isCurrentSceneGridless() ? 500 : 2000); // Update camera position more frequently in gridless scenes
    }

    // New method to stop following the token
    stopFollowingToken() {
        if (this.followInterval) {
            clearInterval(this.followInterval);
            this.followInterval = null;
        }
    }

    panCameraToToken(token) {
        this.startFollowingToken(token); // Start following the token instead of a single pan
    }

    cancelCameraPan() {
        this.allowCameraPanning = false;
        setTimeout(() => this.allowCameraPanning = true, 500);
    }
}

class GridSpaceManager {
    constructor() {
        this.virtualGridSize = game.settings.get("rtscontrols", "gridlessGridSize"); // Assuming this setting is already registered
    }

    virtualGridToPixel(gridPosition) {
        return {
            x: gridPosition.x * this.virtualGridSize, y: gridPosition.y * this.virtualGridSize
        };
    }
}

Hooks.on("ready", function () {
    const settingsManager = new SettingsManager();
    settingsManager.registerSettings();
    initializePathfindingModule(settingsManager);
});

Hooks.on("updateScene", function () {
    this.movementManager.cancelAllMovements();
    this.cameraManager.cancelCameraPan();
});

function initializePathfindingModule(settingsManager) {
    const gridSpaceManager = new GridSpaceManager();
    const pathfindingModule = new PathfindingModule(gridSpaceManager);
    const visualManager = new VisualManager(settingsManager);
    const movementManager = new MovementManager(gridSpaceManager, visualManager);
    const cameraManager = new CameraManager(movementManager);
    movementManager.cameraManager = cameraManager;
    const eventManager = new EventManager(pathfindingModule, movementManager, visualManager, settingsManager);
}