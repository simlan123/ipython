// Copyright (c) IPython Development Team.
// Distributed under the terms of the Modified BSD License.

define([
    'base/js/namespace',
    'jquery',
    'base/js/utils',
    'base/js/dialog',
    'notebook/js/notificationwidget',
    'moment'
], function(IPython, $, utils, dialog, notificationwidget, moment) {
    "use strict";

    // store reference to the NotificationWidget class
    var NotificationWidget = notificationwidget.NotificationWidget;

    /**
     * Construct the NotificationArea object. Options are:
     *     events: $(Events) instance
     *     save_widget: SaveWidget instance
     *     notebook: Notebook instance
     *     keyboard_manager: KeyboardManager instance
     *
     * @constructor
     * @param {string} selector - a jQuery selector string for the
     * notification area element
     * @param {Object} [options] - a dictionary of keyword arguments.
     */
    var NotificationArea = function (selector, options) {
        this.selector = selector;
        this.events = options.events;
        this.save_widget = options.save_widget;
        this.notebook = options.notebook;
        this.keyboard_manager = options.keyboard_manager;
        if (this.selector !== undefined) {
            this.element = $(selector);
        }
        this.widget_dict = {};
    };

    /**
     * Get a widget by name, creating it if it doesn't exist.
     *
     * @method widget
     * @param {string} name - the widget name
     */
    NotificationArea.prototype.widget = function (name) {
        if (this.widget_dict[name] === undefined) {
            return this.new_notification_widget(name);
        }
        return this.get_widget(name);
    };

    /**
     * Get a widget by name, throwing an error if it doesn't exist.
     *
     * @method get_widget
     * @param {string} name - the widget name
     */
    NotificationArea.prototype.get_widget = function (name) {
        if(this.widget_dict[name] === undefined) {
            throw('no widgets with this name');
        }
        return this.widget_dict[name];
    };

    /**
     * Create a new notification widget with the given name. The
     * widget must not already exist.
     *
     * @method new_notification_widget
     * @param {string} name - the widget name
     */
    NotificationArea.prototype.new_notification_widget = function (name) {
        if (this.widget_dict[name] !== undefined) {
            throw('widget with that name already exists!');
        }

        // create the element for the notification widget and add it
        // to the notification aread element
        var div = $('<div/>').attr('id', 'notification_' + name);
        $(this.selector).append(div);

        // create the widget object and return it
        this.widget_dict[name] = new NotificationWidget('#notification_' + name);
        return this.widget_dict[name];
    };

    /**
     * Initialize the default set of notification widgets.
     *
     * @method init_notification_widgets
     */
    NotificationArea.prototype.init_notification_widgets = function () {
        this.init_kernel_notification_widget();
        this.init_notebook_notification_widget();
    };

    /**
     * Initialize the notification widget for kernel status messages.
     *
     * @method init_kernel_notification_widget
     */
    NotificationArea.prototype.init_kernel_notification_widget = function () {
        var that = this;
        var knw = this.new_notification_widget('kernel');
        var $kernel_ind_icon = $("#kernel_indicator_icon");
        var $modal_ind_icon = $("#modal_indicator_icon");

        // Command/Edit mode
        this.events.on('edit_mode.Notebook', function () {
            that.save_widget.update_document_title();
            $modal_ind_icon.attr('class','edit_mode_icon').attr('title','Edit Mode');
        });

        this.events.on('command_mode.Notebook', function () {
            that.save_widget.update_document_title();
            $modal_ind_icon.attr('class','command_mode_icon').attr('title','Command Mode');
        });

        // Implicitly start off in Command mode, switching to Edit mode will trigger event
        $modal_ind_icon.attr('class','command_mode_icon').attr('title','Command Mode');

        // Kernel events 

        // this can be either kernel_created.Kernel or kernel_created.Session
        this.events.on('kernel_created.Kernel kernel_created.Session', function () {
            knw.info("Kernel Created", 500);
        });

        this.events.on('kernel_reconnecting.Kernel', function () {
            knw.warning("Connecting to kernel");
        });

        this.events.on('kernel_connected.Kernel', function () {
            knw.info("Connected", 500);
        });

        this.events.on('kernel_restarting.Kernel', function () {
            that.save_widget.update_document_title();
            knw.set_message("Restarting kernel", 2000);
        });

        this.events.on('kernel_autorestarting.Kernel', function (evt, info) {
            // Only show the dialog on the first restart attempt. This
            // number gets tracked by the `Kernel` object and passed
            // along here, because we don't want to show the user 5
            // dialogs saying the same thing (which is the number of
            // times it tries restarting).
            if (info.attempt === 1) {

                dialog.kernel_modal({
                    notebook: that.notebook,
                    keyboard_manager: that.keyboard_manager,
                    title: "Kernel Restarting",
                    body: "The kernel appears to have died. It will restart automatically.",
                    buttons: {
                        OK : {
                            class : "btn-primary"
                        }
                    }
                });
            };

            that.save_widget.update_document_title();
            knw.danger("Dead kernel");
            $kernel_ind_icon.attr('class','kernel_dead_icon').attr('title','Kernel Dead');
        });

        this.events.on('kernel_interrupting.Kernel', function () {
            knw.set_message("Interrupting kernel", 2000);
        });

        this.events.on('kernel_disconnected.Kernel', function () {
            $kernel_ind_icon
                .attr('class', 'kernel_disconnected_icon')
                .attr('title', 'No Connection to Kernel');
        });

        this.events.on('kernel_connection_failed.Kernel', function (evt, info) {
            // only show the dialog if this is the first failed
            // connect attempt, because the kernel will continue
            // trying to reconnect and we don't want to spam the user
            // with messages
            if (info.attempt === 1) {

                var msg = "A connection to the notebook server could not be established." +
                        " The notebook will continue trying to reconnect, but" +
                        " until it does, you will NOT be able to run code. Check your" +
                        " network connection or notebook server configuration.";

                dialog.kernel_modal({
                    title: "Connection failed",
                    body: msg,
                    keyboard_manager: that.keyboard_manager,
                    notebook: that.notebook,
                    buttons : {
                        "OK": {}
                    }
                });
            }
        });

        this.events.on('kernel_killed.Kernel kernel_killed.Session', function () {
            that.save_widget.update_document_title();
            knw.danger("Dead kernel");
            $kernel_ind_icon.attr('class','kernel_dead_icon').attr('title','Kernel Dead');
        });

        this.events.on('kernel_dead.Kernel', function () {

            var showMsg = function () {

                var msg = 'The kernel has died, and the automatic restart has failed.' +
                        ' It is possible the kernel cannot be restarted.' +
                        ' If you are not able to restart the kernel, you will still be able to save' +
                        ' the notebook, but running code will no longer work until the notebook' +
                        ' is reopened.';

                dialog.kernel_modal({
                    title: "Dead kernel",
                    body : msg,
                    keyboard_manager: that.keyboard_manager,
                    notebook: that.notebook,
                    buttons : {
                        "Manual Restart": {
                            class: "btn-danger",
                            click: function () {
                                that.notebook.start_session();
                            }
                        },
                    "Don't restart": {}
                    }
                });

                return false;
            };

            that.save_widget.update_document_title();
            knw.danger("Dead kernel", undefined, showMsg);
            $kernel_ind_icon.attr('class','kernel_dead_icon').attr('title','Kernel Dead');

            showMsg();
        });

        this.events.on('kernel_dead.Session', function (evt, info) {
            var full = info.xhr.responseJSON.message;
            var short = info.xhr.responseJSON.short_message || 'Kernel error';
            var traceback = info.xhr.responseJSON.traceback;

            var showMsg = function () {
                var msg = $('<div/>').append($('<p/>').text(full));
                var cm, cm_elem, cm_open;

                if (traceback) {
                    cm_elem = $('<div/>')
                        .css('margin-top', '1em')
                        .css('padding', '1em')
                        .addClass('output_scroll');
                    msg.append(cm_elem);
                    cm = CodeMirror(cm_elem.get(0), {
                        mode:  "python",
                        readOnly : true
                    });
                    cm.setValue(traceback);
                    cm_open = $.proxy(cm.refresh, cm);
                }

                dialog.kernel_modal({
                    title: "Failed to start the kernel",
                    body : msg,
                    keyboard_manager: that.keyboard_manager,
                    notebook: that.notebook,
                    open: cm_open,
                    buttons : {
                        "Ok": { class: 'btn-primary' }
                    }
                });

                return false;
            };

            that.save_widget.update_document_title();
            $kernel_ind_icon.attr('class','kernel_dead_icon').attr('title','Kernel Dead');
            knw.danger(short, undefined, showMsg);
        });

        this.events.on('kernel_starting.Kernel', function () {
            window.document.title='(Starting) '+window.document.title;
            $kernel_ind_icon.attr('class','kernel_busy_icon').attr('title','Kernel Busy');
            knw.set_message("Kernel starting, please wait...");
        });

        this.events.on('kernel_ready.Kernel', function () {
            that.save_widget.update_document_title();
            $kernel_ind_icon.attr('class','kernel_idle_icon').attr('title','Kernel Idle');
            knw.info("Kernel ready", 500);
        });

        this.events.on('kernel_idle.Kernel', function () {
            that.save_widget.update_document_title();
            $kernel_ind_icon.attr('class','kernel_idle_icon').attr('title','Kernel Idle');
        });

        this.events.on('kernel_busy.Kernel', function () {
            window.document.title='(Busy) '+window.document.title;
            $kernel_ind_icon.attr('class','kernel_busy_icon').attr('title','Kernel Busy');
        });
        
        // Start the kernel indicator in the busy state, and send a kernel_info request.
        // When the kernel_info reply arrives, the kernel is idle.
        $kernel_ind_icon.attr('class','kernel_busy_icon').attr('title','Kernel Busy');
    };

    /**
     * Initialize the notification widget for notebook status messages.
     *
     * @method init_notebook_notification_widget
     */
    NotificationArea.prototype.init_notebook_notification_widget = function () {
        var nnw = this.new_notification_widget('notebook');

        // Notebook events
        this.events.on('notebook_loading.Notebook', function () {
            nnw.set_message("Loading notebook",500);
        });
        this.events.on('notebook_loaded.Notebook', function () {
            nnw.set_message("Notebook loaded",500);
        });
        this.events.on('notebook_saving.Notebook', function () {
            nnw.set_message("Saving notebook",500);
        });
        this.events.on('notebook_saved.Notebook', function () {
            nnw.set_message("Notebook saved",2000);
        });
        this.events.on('notebook_save_failed.Notebook', function (evt, xhr, status, data) {
            nnw.warning(data || "Notebook save failed");
        });
        
        // Checkpoint events
        this.events.on('checkpoint_created.Notebook', function (evt, data) {
            var msg = "Checkpoint created";
            if (data.last_modified) {
                var d = new Date(data.last_modified);
                msg = msg + ": " + moment(d).format("HH:mm:ss");
            }
            nnw.set_message(msg, 2000);
        });
        this.events.on('checkpoint_failed.Notebook', function () {
            nnw.warning("Checkpoint failed");
        });
        this.events.on('checkpoint_deleted.Notebook', function () {
            nnw.set_message("Checkpoint deleted", 500);
        });
        this.events.on('checkpoint_delete_failed.Notebook', function () {
            nnw.warning("Checkpoint delete failed");
        });
        this.events.on('checkpoint_restoring.Notebook', function () {
            nnw.set_message("Restoring to checkpoint...", 500);
        });
        this.events.on('checkpoint_restore_failed.Notebook', function () {
            nnw.warning("Checkpoint restore failed");
        });

        // Autosave events
        this.events.on('autosave_disabled.Notebook', function () {
            nnw.set_message("Autosave disabled", 2000);
        });
        this.events.on('autosave_enabled.Notebook', function (evt, interval) {
            nnw.set_message("Saving every " + interval / 1000 + "s", 1000);
        });
    };

    IPython.NotificationArea = NotificationArea;

    return {'NotificationArea': NotificationArea};
});
