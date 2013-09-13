"""Base class for a Comm"""

#-----------------------------------------------------------------------------
#  Copyright (C) 2013  The IPython Development Team
#
#  Distributed under the terms of the BSD License.  The full license is in
#  the file COPYING, distributed as part of this software.
#-----------------------------------------------------------------------------

#-----------------------------------------------------------------------------
# Imports
#-----------------------------------------------------------------------------

import uuid

from IPython.config import LoggingConfigurable
from IPython.core.getipython import get_ipython

from IPython.utils.traitlets import Instance, Unicode, Bytes, Bool, Dict, Any

#-----------------------------------------------------------------------------
# Code
#-----------------------------------------------------------------------------

class Comm(LoggingConfigurable):
    
    shell = Instance('IPython.core.interactiveshell.InteractiveShellABC')
    def _shell_default(self):
        return get_ipython()
    iopub_socket = Any()
    def _iopub_socket_default(self):
        return self.shell.parent.iopub_socket
    session = Instance('IPython.kernel.zmq.session.Session')
    def _session_default(self):
        if self.shell is None:
            return
        return self.shell.parent.session
    
    target = Unicode('comm')
    
    topic = Bytes()
    def _topic_default(self):
        return ('comm-%s' % self.comm_id).encode('ascii')
    
    _open_data = Dict(help="data dict, if any, to be included in comm_close")
    _close_data = Dict(help="data dict, if any, to be included in comm_close")
    
    _open_callback = Any()
    _msg_callback = Any()
    _close_callback = Any()
    
    _closed = Bool(False)
    comm_id = Unicode()
    def _comm_id_default(self):
        return uuid.uuid4().hex
    
    primary = Bool(True, help="Am I the primary or secondary Comm?")
    
    def __init__(self, **kwargs):
        super(Comm, self).__init__(**kwargs)
        get_ipython().comm_manager.register_comm(self)
        if self.primary:
            # I am primary, open my peer
            self.open()
        else:
            # I am secondary, handle creation
            self.handle_open(self._open_data)
    
    def _publish_msg(self, msg_type, data=None, **keys):
        """Helper for sending a comm message on IOPub"""
        data = {} if data is None else data
        self.session.send(self.iopub_socket, msg_type,
            dict(data=data, comm_id=self.comm_id, **keys),
            ident=self.topic,
        )
    
    def __del__(self):
        """trigger close on gc"""
        self.close()
    
    # publishing messages
    
    def open(self, data=None):
        """Open the frontend-side version of this comm"""
        if data is None:
            data = self._open_data
        self._publish_msg('comm_open', data, target=self.target)
    
    def close(self, data=None):
        """Close the frontend-side version of this comm"""
        if self._closed:
            # only close once
            return
        if data is None:
            data = self._close_data
        self._publish_msg('comm_close', data)
        self._closed = True
    
    def send(self, data=None):
        """Update the frontend-side version of this comm"""
        self._publish_msg('comm_msg', data)
    
    # registering callbacks
    def on_open(self, callback):
        """Register a callback for comm_open
        
        Will be called with the `data` of the open message.
        
        Call `on_open(None)` to disable an existing callback.
        """
        self._open_callback = callback
    
    def on_close(self, callback):
        """Register a callback for comm_close
        
        Will be called with the `data` of the close message.
        
        Call `on_close(None)` to disable an existing callback.
        """
        self._close_callback = callback
    
    def on_msg(self, callback):
        """Register a callback for comm_msg
        
        Will be called with the `data` of any comm_msg messages.
        
        Call `on_msg(None)` to disable an existing callback.
        """
        self._msg_callback = callback
    
    # handling of incoming messages
    
    def handle_open(self, data):
        """Handle a comm_open message"""
        self.log.debug("handle_open[%s](%s)", self.comm_id, data)
        if self._open_callback:
            self._open_callback(data)
    
    def handle_close(self, data):
        """Handle a comm_close message"""
        self.log.debug("handle_close[%s](%s)", self.comm_id, data)
        if self._close_callback:
            self._close_callback(data)
    
    def handle_msg(self, data):
        """Handle a comm_msg message"""
        self.log.debug("handle_msg[%s](%s)", self.comm_id, data)
        if self._msg_callback:
            self._msg_callback(data)


__all__ = ['Comm']