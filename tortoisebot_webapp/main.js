var app = new Vue({
    el: '#app',
    // storing the state of the page
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        rosbridge_address: 'wss://i-039046e98e74e8ffd.robotigniteacademy.com/f5850ba5-d72d-4a14-9465-e9a1e602edd5/rosbridge/',
        port: '9090',
        // map stuff
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        // 3d stuff
        // 3D stuff
        viewer: null,
        tfClient: null,
        urdfClient: null,
        // dragging data
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },
        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        },
        // publisher
        pubInterval: null,
        goal: null,
        action: {
            goal: { position: {x: 0, y: 0, z: 0} },
            feedback: { position: 0, state: 'idle' },
            result: { success: false },
            status: { status: 0, text: '' },
        },
        waypoints: [
                { x: 0.6419972203961098, y: -0.4799273810332513 },
                { x: 0.6419972203961098, y: 0.4588947498375426 },
                { x: 0.17613901815373223, y: 0.45 },
                { x: 0.17613901815373223, y: 0.0 },
                { x: -0.1, y: 0.0 },
                { x: -0.13154427746203334, y: -0.5415337902542063 },
                { x: -0.6324729022856, y: -0.5415337902542063 },
                { x: -0.1, y: -0.5415337902542063 },
                { x: -0.1, y: 0.47429516988672876 },
                { x: -0.6980940852112706, y: 0.47429516988672876 },
                // Add more waypoints as needed
            ],
        currentWaypointIndex: 0,
        clickedWaypointIndex: -1,
    },
    // helper methods to connect to ROS
    methods: {
        connect: function() {
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.connected = true
                this.loading = false
                this.setup3DViewer()
                this.setCamera()
                this.pubInterval = setInterval(this.publish, 100)
                this.mapViewer = new ROS2D.Viewer({
                    divID: 'map',
                    width: 500,
                    height: 500
                })

                // Setup the map client.
                this.mapGridClient = new ROS2D.OccupancyGridClient({
                    ros: this.ros,
                    rootObject: this.mapViewer.scene,
                    continuous: true,
                })
                // Scale the canvas to fit to the map
                this.mapGridClient.on('change', () => {
                    this.mapViewer.scaleToDimensions(this.mapGridClient.currentGrid.width, this.mapGridClient.currentGrid.height);
                    this.mapViewer.shift(this.mapGridClient.currentGrid.pose.position.x, this.mapGridClient.currentGrid.pose.position.y)
                })
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.connected = false
                this.loading = false
                this.unset3DViewer()
                clearInterval(this.pubInterval)
                document.getElementById('map').innerHTML = ''
                document.getElementById('divCamera').innerHTML = ''
            })
        },
        disconnect: function() {
            this.ros.close()
        },
        setup3DViewer() {
            this.viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: 500,
                height: 500,
                antialias: true,
                fixedFrame: 'odom'
            })

            // Add a grid.
            this.viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.5,
                num_cells: 20
            }))

            // Setup a client to listen to TFs.
            this.tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0
            })

            // Setup the URDF client.
            this.urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: 'robot_description',
                tfClient: this.tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: this.viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },
        unset3DViewer() {
            document.getElementById('div3DViewer').innerHTML = ''
        },
        setCamera: function() {
            let without_wss = this.rosbridge_address.split('wss://')[1]
            console.log(without_wss)
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            console.log(domain)
            let host = domain + '/cameras'
            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                width: 500,
                height: 500,
                topic: '/camera/image_raw',
                ssl: true,
            })
        },
        publish: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: this.joystick.vertical, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: -1*this.joystick.horizontal, },
            })
            topic.publish(message)
        },
        sendCommand: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: 1, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: 0.5, },
            })
            topic.publish(message)
        },
        startDrag() {
            this.dragging = true
            this.x = this.y = 0
        },
        stopDrag() {
            this.dragging = false
            this.x = this.y = 'no'
            this.dragCircleStyle.display = 'none'
            this.resetJoystickVals()
        },
        doDrag(event) {
            if (this.dragging) {
                this.x = event.offsetX
                this.y = event.offsetY
                let ref = document.getElementById('dragstartzone')
                this.dragCircleStyle.display = 'inline-block'

                let minTop = ref.offsetTop - parseInt(this.dragCircleStyle.height) / 2
                let maxTop = minTop + 200
                let top = this.y + minTop
                this.dragCircleStyle.top = `${top}px`

                let minLeft = ref.offsetLeft - parseInt(this.dragCircleStyle.width) / 2
                let maxLeft = minLeft + 200
                let left = this.x + minLeft
                this.dragCircleStyle.left = `${left}px`

                this.setJoystickVals()
            }
        },
        setJoystickVals() {
            this.joystick.vertical = -1 * ((this.y / 200) - 0.5)
            this.joystick.horizontal = +1 * ((this.x / 200) - 0.5)
        },
        resetJoystickVals() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
        },
       sendGoal: function(waypoint, index) {
                console.log("Clicked waypoint", waypoint.x);
                if (index === this.currentWaypointIndex) {
                    let actionClient = new ROSLIB.ActionClient({
                        ros: this.ros,
                        serverName: '/tortoisebot_as',
                        actionName: 'course_web_dev_ros/WaypointActionAction'
                    })

                    this.goal = new ROSLIB.Goal({
                        actionClient: actionClient,
                        goalMessage: { position: { x: waypoint.x, y: waypoint.y, z: 0 } }
                    })

                    this.goal.on('status', (status) => {
                        this.action.status = status
                    })

                    this.goal.on('feedback', (feedback) => {
                        console.log("Received feedback", feedback);
                        this.action.feedback = feedback
                    })

                    this.goal.on('result', (result) => {
                        this.action.result = result
                    })

                    this.goal.send()
                    this.currentWaypointIndex++;
                    this.clickedWaypointIndex = index;
                }
        },
        cancelGoal: function() {
            this.goal.cancel()
        },
    },
    mounted() {
        this.interval = setInterval(() => {
            if (this.ros != null && this.ros.isConnected) {
                this.ros.getNodes((data) => { }, (error) => { })
            }
        }, 10000)
        window.addEventListener('mouseup', this.stopDrag)
    },
})