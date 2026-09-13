let Refresh;
try {
    Refresh = await import('../refresh.js');
} catch (error) {
    throw new Error(`refresh coordinator must be importable: ${error.message}`);
}

let passed = 0;

function assertEqual(actual, expected, message) {
    if (!Object.is(actual, expected))
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    passed++;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

const coordinator = new Refresh.RefreshCoordinator();
const oldWeather = deferred();
const oldAlerts = deferred();
const appliedWeather = [];
const appliedAlerts = [];
let factories = 0;
let scheduled = 0;

const handlers = {
    isActive: () => true,
    onWeather: value => appliedWeather.push(value),
    onWeatherError: () => {},
    onAlerts: value => appliedAlerts.push(value),
    scheduleRefresh: () => scheduled++,
};

const oldCycle = Refresh.runRefreshCycle(coordinator, () => {
    factories++;
    return [oldWeather.promise, oldAlerts.promise];
}, handlers);

coordinator.supersede();
const duplicateStarted = await Refresh.runRefreshCycle(coordinator, () => {
    factories++;
    return [Promise.resolve('must-not-run'), Promise.resolve('must-not-run')];
}, handlers);
assertEqual(duplicateStarted, false, 'a debounce firing during a fetch records pending work without starting another request');

oldAlerts.resolve({alerts: ['stale']});
oldWeather.reject(new Error('old location failed'));
assertEqual(await oldCycle, true, 'the original asynchronous cycle completes after rejection');
assertEqual(factories, 1, 'a busy fetch does not invoke another request factory');
assertEqual(appliedWeather.length, 0, 'rejected stale weather is not applied');
assertEqual(appliedAlerts.length, 0, 'fulfilled stale alerts are not applied');
assertEqual(scheduled, 1, 'a rejected stale request schedules exactly one pending refresh');

const freshStarted = await Refresh.runRefreshCycle(coordinator, () => {
    factories++;
    return [Promise.resolve({location: 'new'}), Promise.resolve({alerts: ['fresh']})];
}, handlers);
assertEqual(freshStarted, true, 'the pending refresh can start after the old cycle finishes');
assertEqual(appliedWeather[0].location, 'new', 'fresh weather is applied');
assertEqual(appliedAlerts[0].alerts[0], 'fresh', 'fresh alerts are applied');
assertEqual(scheduled, 1, 'a completed fresh cycle does not create a refresh busy loop');

const slowAlerts = deferred();
let weatherPublished = false;
const independent = Refresh.runRefreshCycle(new Refresh.RefreshCoordinator(), () => [
    Promise.resolve({location: 'Detroit'}), slowAlerts.promise,
], {...handlers, onWeather: () => { weatherPublished = true; }});
await Promise.resolve();
await Promise.resolve();
assertEqual(weatherPublished, true, 'weather publishes without waiting for slow alerts');
slowAlerts.resolve({alerts: []});
await independent;

let failure = '';
const factoryCoordinator = new Refresh.RefreshCoordinator();
await Refresh.runRefreshCycle(factoryCoordinator, () => {
    throw new Error('request setup failed');
}, {...handlers, onWeatherError: error => { failure = error.message; }});
assertEqual(failure, 'request setup failed', 'synchronous setup failures reach the error display');
assertEqual(await Refresh.runRefreshCycle(factoryCoordinator, () => [Promise.resolve({}),
    Promise.resolve({})], handlers), true, 'setup failure releases coordinator');

let afterDestroy = 0;
await Refresh.runRefreshCycle(new Refresh.RefreshCoordinator(), () => [Promise.resolve({}),
    Promise.resolve({})], {...handlers, isActive: () => false,
    onWeather: () => afterDestroy++, onAlerts: () => afterDestroy++});
assertEqual(afterDestroy, 0, 'disabled extension never accepts results');

print(`refresh: ${passed} assertions passed`);
