const canvasSketch = require('canvas-sketch');
const Tweakpane = require('tweakpane');

const settings = {
    dimensions: [ 1200, 500 ],
    animate: true
};

const params = {
    text: 'Renan',
    grid: 20,
    speed: 1,
    size: 5,
    direction: 0,
    radius: 1,
    mirror: 0,
    background: {r: 25, g: 25, b: 25},
    led: {r: 0, g: 255, b: 0},
};

let bitmap = null, lastSize = null, lastGrid = null;

const sketch = () => {
    return ({ context, width, height, frame }) => {
        context.fillStyle = `rgb(${params.background.r}, ${params.background.g}, ${params.background.b})`;
        context.fillRect(0, 0, width, height);

        if (bitmap === null || lastSize !== params.size || lastGrid !== params.grid) {
            bitmap = getBitmapData(width, height, params.grid, params.size, params.text, context);
            lastSize = params.size;
            lastGrid = params.grid;
        }

        const size = height/params.grid;

        const line = params.grid * 4;
        const s = bitmap.length;
        const pos = Math.ceil(frame * params.speed) % (s/line);
        let k = pos * line;
        for (let i = params.mirror * Math.ceil(width/size);
             params.mirror === 0 ? i < Math.ceil(width/size) : i > 0;
             params.mirror === 0 ? i += 1 : i -= 1) {
            for (let j = 0; j < Math.ceil(height/size); j += 1) {

                context.save();
                context.translate(i*size + size*0.5, j*size + size*0.5);

                const r = Math.ceil(params.led.r * bitmap[k  ]/255);
                const g = Math.ceil(params.led.g * bitmap[k+1]/255);
                const b = Math.ceil(params.led.b * bitmap[k+2]/255);
                context.fillStyle = `rgb(${r}, ${g}, ${b})`;
                context.beginPath();
                context.arc(0,0, size * 0.5 * params.radius, 0, Math.PI*2);
                context.fill();
                context.restore();
                k += 4;
                if (k >= s) {
                    k = 0;
                }
            }
        }
    };
};
function getBitmapData(width, heigth, grid, size, text) {
    const fsize = grid * ((size+5)/10);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fsize}px monospace`;
    const metrics = context.measureText(text);
    canvas.width = grid;
    canvas.height = Math.ceil(metrics.width) + grid;

    context.fillStyle = 'black';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const x = canvas.width - (canvas.width - metrics.actualBoundingBoxAscent)/2;
    const y = 0;

    context.save();
    context.translate(x, y);

    context.rotate(Math.PI / 2);
    context.scale(1, -1);

    context.fillStyle = `white`;
    context.font = `${fsize}px monospace`;
    context.fillText(text, 0, 0);
    context.restore()

    return context.getImageData(0, 0, canvas.width, canvas.height).data;
}
const createPane = () => {
    const pane = new Tweakpane.Pane();
    let folder;

    folder = pane.addFolder({ title: 'Config '});
    folder.addInput(params, 'grid',   { min: 10, max:  40, step: 1 });
    folder.addInput(params, 'radius',   { min: 0.5, max:  1, step: 0.1 });
    folder.addInput(params, 'speed',  { min:  0, max:   5, step: 0.25 });
    folder.addInput(params, 'size',   { min:  1, max:  10, step: 1 });
    folder.addInput(params, 'mirror', { min:  0, max:   1, step: 1 });
    folder = pane.addFolder({ title: 'Color '});
    folder.addInput(params, 'background');
    folder.addInput(params, 'led');
};


createPane();
canvasSketch(sketch, settings);
